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
#define MAX_COMMAND_SIZE 65536
#define MAX_RULES 256

static UINT32 rule_ids[MAX_RULES];
static size_t rule_count = 0;
static UINT32 proxy_id = 0;
static BOOL engine_running = FALSE;

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
        if (*value == '\\') return FALSE;
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

static BOOL valid_process_name(const char *name) {
    size_t length = strlen(name);
    return length > 4 && length < MAX_PATH &&
           _stricmp(name + length - 4, ".exe") == 0 &&
           strpbrk(name, "*?\\/") == NULL;
}

static void clear_rules(void) {
    size_t index;
    for (index = 0; index < rule_count; ++index)
        ProxyBridge_DeleteRule(rule_ids[index]);
    rule_count = 0;
}

static BOOL replace_rules(const char *command) {
    const char *cursor;
    if (!strstr(command, "\"host\":\"127.0.0.1\"") ||
        !strstr(command, "\"port\":7891")) {
        emit("error", "proxy endpoint rejected");
        return FALSE;
    }

    if (engine_running) {
        ProxyBridge_Stop();
        engine_running = FALSE;
    }
    clear_rules();

    if (!proxy_id) {
        proxy_id = ProxyBridge_AddProxyConfig(
            PROXY_TYPE_SOCKS5, "127.0.0.1", KOKORO_SOCKS_PORT, "", "", TRUE);
        if (!proxy_id) {
            emit("error", "unable to configure local SOCKS proxy");
            return FALSE;
        }
    }

    cursor = strstr(command, "\"rules\":[");
    if (!cursor) {
        emit("error", "rules are missing");
        return FALSE;
    }
    cursor += strlen("\"rules\":[");

    while (*cursor && *cursor != ']') {
        const char *end;
        char object[2048];
        char process_name[MAX_PATH];
        char protocol_name[16];
        char action_name[16];
        UINT32 priority;
        BOOL enabled;
        RuleProtocol protocol;
        RuleAction action;
        UINT32 id;
        size_t object_length;

        while (*cursor == ',' || *cursor == ' ') ++cursor;
        if (*cursor != '{' || rule_count >= MAX_RULES) {
            emit("error", "invalid or excessive rules");
            return FALSE;
        }
        end = find_object_end(cursor);
        if (!end) { emit("error", "unterminated rule"); return FALSE; }
        object_length = (size_t)(end - cursor + 1);
        if (object_length >= sizeof(object)) { emit("error", "rule is too large"); return FALSE; }
        memcpy(object, cursor, object_length);
        object[object_length] = '\0';

        if (!read_string(object, "processName", process_name, sizeof(process_name)) ||
            !read_string(object, "protocol", protocol_name, sizeof(protocol_name)) ||
            !read_string(object, "action", action_name, sizeof(action_name)) ||
            !read_bool(object, "enabled", &enabled) ||
            !read_uint(object, "priority", &priority) ||
            !valid_process_name(process_name) || priority != rule_count + 1) {
            emit("error", "invalid rule");
            return FALSE;
        }

        if (_stricmp(protocol_name, "TCP") == 0) protocol = RULE_PROTOCOL_TCP;
        else if (_stricmp(protocol_name, "UDP") == 0) protocol = RULE_PROTOCOL_UDP;
        else if (_stricmp(protocol_name, "BOTH") == 0) protocol = RULE_PROTOCOL_BOTH;
        else { emit("error", "invalid protocol"); return FALSE; }

        if (_stricmp(action_name, "PROXY") == 0) action = RULE_ACTION_PROXY;
        else if (_stricmp(action_name, "DIRECT") == 0) action = RULE_ACTION_DIRECT;
        else if (_stricmp(action_name, "BLOCK") == 0) action = RULE_ACTION_BLOCK;
        else { emit("error", "invalid action"); return FALSE; }

        id = ProxyBridge_AddRule(process_name, "*", "*", "*", protocol, action,
                                 action == RULE_ACTION_PROXY ? proxy_id : 0);
        if (!id || (!enabled && !ProxyBridge_DisableRule(id))) {
            emit("error", "unable to install rule");
            return FALSE;
        }
        rule_ids[rule_count++] = id;
        cursor = end + 1;
    }

    ProxyBridge_SetLocalhostViaProxy(FALSE);
    ProxyBridge_SetTrafficLoggingEnabled(FALSE);
    if (!ProxyBridge_Start()) {
        emit("error", "packet interception failed to start");
        return FALSE;
    }
    engine_running = TRUE;
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

int main(void) {
    char command[MAX_COMMAND_SIZE];
    if (!IsUserAnAdmin()) {
        emit("error", "administrator privileges required");
        return 5;
    }
    SetConsoleCtrlHandler(control_handler, TRUE);
    emit("ready", NULL);

    while (fgets(command, sizeof(command), stdin)) {
        if (!strstr(command, "\"version\":1")) {
            emit("error", "unsupported protocol version");
            continue;
        }
        if (strstr(command, "\"command\":\"replace_rules\"")) {
            if (!replace_rules(command)) break;
        } else if (strstr(command, "\"command\":\"status\"")) {
            emit(engine_running ? "running" : "ready", NULL);
        } else if (strstr(command, "\"command\":\"shutdown\"")) {
            break;
        } else {
            emit("error", "unsupported command");
        }
    }

    if (engine_running) ProxyBridge_Stop();
    clear_rules();
    if (proxy_id) ProxyBridge_DeleteProxyConfig(proxy_id);
    emit("stopped", NULL);
    return 0;
}
