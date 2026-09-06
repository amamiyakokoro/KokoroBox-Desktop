#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <shellapi.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ProxyBridge.h"

#define PROTOCOL_VERSION 1
#define KOKORO_SOCKS_PORT 7891
#define MAX_COMMAND_SIZE 262144
#define MAX_USER_RULES 256
#define MAX_MANAGED_RULES 258
#define MAX_PROCESS_PATTERN 1024
#define MAX_PROCESS_LIST 65536

typedef struct ParsedRule {
    char process_pattern[MAX_PROCESS_PATTERN];
    RuleProtocol protocol;
    RuleAction action;
    BOOL enabled;
    UINT32 priority;
} ParsedRule;

static UINT32 rule_ids[MAX_MANAGED_RULES];
static size_t rule_count = 0;
static UINT32 proxy_id = 0;
static UINT32 guard_id = 0;
static BOOL engine_running = FALSE;
static char active_processes[MAX_PROCESS_LIST] = "";

static void emit(const char *event, const char *message) {
    if (message && message[0])
        printf("{\"version\":1,\"event\":\"%s\",\"message\":\"%s\"}\n", event, message);
    else
        printf("{\"version\":1,\"event\":\"%s\"}\n", event);
    fflush(stdout);
}

static const char *find_value(const char *object, const char *key) {
    char needle[80];
    _snprintf_s(needle, sizeof(needle), _TRUNCATE, "\"%s\":", key);
    const char *found = strstr(object, needle);
    return found ? found + strlen(needle) : NULL;
}

static BOOL read_string(const char *object, const char *key, char *output, size_t output_size) {
    const char *value = find_value(object, key);
    size_t index = 0;
    if (!value || *value++ != '"') return FALSE;
    while (*value && *value != '"' && index + 1 < output_size) {
        if (*value == '\\') {
            value++;
            if (*value != '\\' && *value != '/' && *value != '"') return FALSE;
        }
        output[index++] = *value++;
    }
    if (*value != '"') return FALSE;
    output[index] = '\0';
    return TRUE;
}

static BOOL read_uint(const char *object, const char *key, UINT32 *output) {
    const char *value = find_value(object, key);
    char *end = NULL;
    unsigned long parsed;
    if (!value) return FALSE;
    parsed = strtoul(value, &end, 10);
    if (end == value || parsed > UINT32_MAX) return FALSE;
    *output = (UINT32)parsed;
    return TRUE;
}

static BOOL read_bool(const char *object, const char *key, BOOL *output) {
    const char *value = find_value(object, key);
    if (!value) return FALSE;
    if (strncmp(value, "true", 4) == 0) { *output = TRUE; return TRUE; }
    if (strncmp(value, "false", 5) == 0) { *output = FALSE; return TRUE; }
    return FALSE;
}

static const char *find_object_end(const char *object) {
    BOOL in_string = FALSE;
    BOOL escaped = FALSE;
    const char *cursor;
    for (cursor = object; *cursor; ++cursor) {
        if (in_string) {
            if (escaped) escaped = FALSE;
            else if (*cursor == '\\') escaped = TRUE;
            else if (*cursor == '"') in_string = FALSE;
        } else if (*cursor == '"') {
            in_string = TRUE;
        } else if (*cursor == '}') {
            return cursor;
        }
    }
    return NULL;
}

static BOOL valid_process_pattern(const char *pattern) {
    size_t index;
    size_t length = strlen(pattern);
    if (length <= 4 || length >= MAX_PROCESS_PATTERN ||
        _stricmp(pattern + length - 4, ".exe") != 0 ||
        strpbrk(pattern, "?;,\"") != NULL) {
        return FALSE;
    }
    for (index = 0; index < length; ++index) {
        if ((unsigned char)pattern[index] < 0x20) return FALSE;
    }
    return TRUE;
}

static BOOL clear_rules(void) {
    size_t index;
    size_t remaining = 0;
    for (index = 0; index < rule_count; ++index) {
        if (!ProxyBridge_DeleteRule(rule_ids[index]))
            rule_ids[remaining++] = rule_ids[index];
    }
    rule_count = remaining;
    return remaining == 0;
}

static BOOL install_guard(const char *processes) {
    UINT32 next_guard;
    if (guard_id) {
        if (!ProxyBridge_EditRule(guard_id, processes, "*", "0-65535", "*",
                                  RULE_PROTOCOL_BOTH, RULE_ACTION_BLOCK, 0) ||
            !ProxyBridge_MoveRuleToPosition(guard_id, 1)) {
            emit("error", "unable to update atomic replacement guard");
            return FALSE;
        }
        return TRUE;
    }
    /* The port filter ensures this process-scoped rule is evaluated before fallback rules. */
    next_guard = ProxyBridge_AddRule(processes, "*", "0-65535", "*", RULE_PROTOCOL_BOTH,
                                     RULE_ACTION_BLOCK, 0);
    if (!next_guard) {
        emit("error", "unable to install atomic replacement guard");
        return FALSE;
    }
    if (!ProxyBridge_MoveRuleToPosition(next_guard, 1)) {
        ProxyBridge_DeleteRule(next_guard);
        emit("error", "unable to install atomic replacement guard");
        return FALSE;
    }
    guard_id = next_guard;
    return TRUE;
}

static BOOL add_managed_rule(const char *process_name, const char *target_hosts,
                             RuleProtocol protocol, RuleAction action,
                             UINT32 selected_proxy, BOOL enabled) {
    UINT32 id;
    if (rule_count >= MAX_MANAGED_RULES) return FALSE;
    id = ProxyBridge_AddRule(process_name, target_hosts, "*", "*", protocol, action,
                             selected_proxy);
    if (!id) return FALSE;
    if (!enabled && !ProxyBridge_DisableRule(id)) {
        ProxyBridge_DeleteRule(id);
        return FALSE;
    }
    rule_ids[rule_count++] = id;
    return TRUE;
}

static BOOL add_mandatory_exclusions(void) {
    static const char *network_targets =
        "127.*.*.*;169.254.*.*;224.0.0.0-239.255.255.255;*.*.*.255;"
        "::1;fe80::/10;ff00::/8";
    static const char *process_names =
        "KokoroBox.exe;mihomo.exe;mihomo-alpha.exe;sparkle-service.exe;"
        "kokorobox-process-router.exe;crashpad_handler.exe;elevate.exe;"
        "kokorobox-desktop-windows-*-setup.exe";
    return add_managed_rule("*", network_targets, RULE_PROTOCOL_BOTH,
                            RULE_ACTION_DIRECT, 0, TRUE) &&
           add_managed_rule(process_names, "*", RULE_PROTOCOL_BOTH,
                            RULE_ACTION_DIRECT, 0, TRUE);
}

static BOOL append_process_pattern(char *list, size_t capacity, const char *pattern) {
    size_t used = strlen(list);
    size_t length = strlen(pattern);
    size_t separator = used ? 1 : 0;
    if (used + separator + length + 1 > capacity) return FALSE;
    if (separator) list[used++] = ';';
    memcpy(list + used, pattern, length + 1);
    return TRUE;
}

static BOOL parse_rules(const char *command, ParsedRule *rules, size_t *parsed_count,
                        char *enabled_processes) {
    const char *cursor;
    *parsed_count = 0;
    enabled_processes[0] = '\0';
    cursor = strstr(command, "\"rules\":[");
    if (!cursor) {
        emit("error", "rules are missing");
        return FALSE;
    }
    cursor += strlen("\"rules\":[");

    while (*cursor && *cursor != ']') {
        const char *end;
        char object[2048];
        ParsedRule *rule;
        char protocol_name[16];
        char action_name[16];
        size_t object_length;

        while (*cursor == ',' || *cursor == ' ') ++cursor;
        if (*cursor != '{' || *parsed_count >= MAX_USER_RULES) {
            emit("error", "invalid or excessive rules");
            return FALSE;
        }
        end = find_object_end(cursor);
        if (!end) { emit("error", "unterminated rule"); return FALSE; }
        object_length = (size_t)(end - cursor + 1);
        if (object_length >= sizeof(object)) { emit("error", "rule is too large"); return FALSE; }
        memcpy(object, cursor, object_length);
        object[object_length] = '\0';
        rule = &rules[*parsed_count];

        if (!read_string(object, "processPattern", rule->process_pattern,
                         sizeof(rule->process_pattern)) ||
            !read_string(object, "protocol", protocol_name, sizeof(protocol_name)) ||
            !read_string(object, "action", action_name, sizeof(action_name)) ||
            !read_bool(object, "enabled", &rule->enabled) ||
            !read_uint(object, "priority", &rule->priority) ||
            !valid_process_pattern(rule->process_pattern) ||
            rule->priority != (UINT32)(*parsed_count + 1)) {
            emit("error", "invalid rule");
            return FALSE;
        }

        if (_stricmp(protocol_name, "TCP") == 0) rule->protocol = RULE_PROTOCOL_TCP;
        else if (_stricmp(protocol_name, "UDP") == 0) rule->protocol = RULE_PROTOCOL_UDP;
        else if (_stricmp(protocol_name, "BOTH") == 0) rule->protocol = RULE_PROTOCOL_BOTH;
        else { emit("error", "invalid protocol"); return FALSE; }

        if (_stricmp(action_name, "PROXY") == 0) rule->action = RULE_ACTION_PROXY;
        else if (_stricmp(action_name, "DIRECT") == 0) rule->action = RULE_ACTION_DIRECT;
        else if (_stricmp(action_name, "BLOCK") == 0) rule->action = RULE_ACTION_BLOCK;
        else { emit("error", "invalid action"); return FALSE; }

        if (rule->enabled && !append_process_pattern(enabled_processes, MAX_PROCESS_LIST,
                                                     rule->process_pattern)) {
            emit("error", "application patterns exceed the process guard limit");
            return FALSE;
        }
        (*parsed_count)++;
        cursor = end + 1;
    }
    if (*cursor != ']') {
        emit("error", "unterminated rules");
        return FALSE;
    }
    return TRUE;
}

static BOOL replace_rules(const char *command) {
    ParsedRule rules[MAX_USER_RULES];
    size_t parsed_count;
    size_t index;
    char next_processes[MAX_PROCESS_LIST];
    char guarded_processes[MAX_PROCESS_LIST];
    BOOL fail_closed;
    BOOL proxy_udp_dns;

    if (!strstr(command, "\"host\":\"127.0.0.1\"") ||
        !strstr(command, "\"port\":7891") ||
        !read_bool(command, "failClosed", &fail_closed) || !fail_closed ||
        !read_bool(command, "proxyUdpDns", &proxy_udp_dns)) {
        emit("error", "proxy endpoint rejected");
        return FALSE;
    }
    if (!parse_rules(command, rules, &parsed_count, next_processes)) return FALSE;
    guarded_processes[0] = '\0';
    if ((active_processes[0] &&
         !append_process_pattern(guarded_processes, sizeof(guarded_processes), active_processes)) ||
        (next_processes[0] &&
         !append_process_pattern(guarded_processes, sizeof(guarded_processes), next_processes))) {
        emit("error", "application patterns exceed the atomic guard limit");
        return FALSE;
    }
    if (!guarded_processes[0]) {
        emit("error", "at least one enabled rule is required");
        return FALSE;
    }
    if (!install_guard(guarded_processes)) return FALSE;
    if (!clear_rules()) {
        emit("error", "unable to remove the previous rule set");
        return FALSE;
    }

    if (!proxy_id) {
        proxy_id = ProxyBridge_AddProxyConfig(
            PROXY_TYPE_SOCKS5, "127.0.0.1", KOKORO_SOCKS_PORT, "", "", TRUE);
        if (!proxy_id) {
            emit("error", "unable to configure local SOCKS proxy");
            return FALSE;
        }
    }

    if (!add_mandatory_exclusions()) {
        emit("error", "unable to install mandatory exclusions");
        return FALSE;
    }
    for (index = 0; index < parsed_count; ++index) {
        UINT32 selected_proxy = rules[index].action == RULE_ACTION_PROXY ? proxy_id : 0;
        if (!add_managed_rule(rules[index].process_pattern, "*", rules[index].protocol,
                              rules[index].action, selected_proxy, rules[index].enabled)) {
            emit("error", "unable to install rule");
            return FALSE;
        }
    }

    ProxyBridge_SetLocalhostViaProxy(FALSE);
    ProxyBridge_SetProxyUdpDnsEnabled(proxy_udp_dns);
    ProxyBridge_SetTrafficLoggingEnabled(FALSE);
    if (!engine_running) {
        if (!ProxyBridge_Start()) {
            emit("error", "packet interception failed to start");
            return FALSE;
        }
        engine_running = TRUE;
    }
    strcpy_s(active_processes, sizeof(active_processes), next_processes);
    if (!ProxyBridge_DeleteRule(guard_id)) {
        emit("error", "unable to commit atomic rule replacement");
        return FALSE;
    }
    guard_id = 0;
    emit("rules_replaced", NULL);
    return TRUE;
}

static BOOL WINAPI control_handler(DWORD event) {
    if (event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT || event == CTRL_CLOSE_EVENT) {
        if (engine_running) ProxyBridge_Stop();
        ExitProcess(0);
    }
    return FALSE;
}

int main(int argc, char **argv) {
    char command[MAX_COMMAND_SIZE];
    (void)argv;
    if (argc != 1) {
        emit("error", "command-line arguments are not supported");
        return 2;
    }
    if (!IsUserAnAdmin()) {
        emit("error", "administrator privileges required");
        return 5;
    }
    SetConsoleCtrlHandler(control_handler, TRUE);
    emit("ready", NULL);

    while (fgets(command, sizeof(command), stdin)) {
        UINT32 version;
        char command_name[32];
        if (!read_uint(command, "version", &version) || version != PROTOCOL_VERSION) {
            emit("error", "unsupported protocol version");
            continue;
        }
        if (!read_string(command, "command", command_name, sizeof(command_name))) {
            emit("error", "command is missing");
            continue;
        }
        if (strcmp(command_name, "replace_rules") == 0) {
            replace_rules(command);
        } else if (strcmp(command_name, "status") == 0) {
            emit(engine_running ? "running" : "ready", NULL);
        } else if (strcmp(command_name, "shutdown") == 0) {
            break;
        } else {
            emit("error", "unsupported command");
        }
    }

    if (engine_running) ProxyBridge_Stop();
    clear_rules();
    if (guard_id) ProxyBridge_DeleteRule(guard_id);
    if (proxy_id) ProxyBridge_DeleteProxyConfig(proxy_id);
    emit("stopped", NULL);
    return 0;
}
