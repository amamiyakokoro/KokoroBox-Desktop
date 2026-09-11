#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>
#include <node_api.h>

static NSString *const KBServicePlistName = @"KokoroBoxService.plist";

static void KBThrow(napi_env env, NSString *message) {
  napi_throw_error(env, nullptr, message.UTF8String ?: "macOS service management failed");
}

static napi_value KBString(napi_env env, NSString *value) {
  napi_value result;
  napi_create_string_utf8(env, value.UTF8String, NAPI_AUTO_LENGTH, &result);
  return result;
}

static NSString *KBStatusName(SMAppServiceStatus status) API_AVAILABLE(macos(13.0)) {
  switch (status) {
    case SMAppServiceStatusNotRegistered:
      return @"not-registered";
    case SMAppServiceStatusEnabled:
      return @"enabled";
    case SMAppServiceStatusRequiresApproval:
      return @"requires-approval";
    case SMAppServiceStatusNotFound:
      return @"not-found";
  }
  return @"unknown";
}

static SMAppService *KBService(void) API_AVAILABLE(macos(13.0)) {
  return [SMAppService daemonServiceWithPlistName:KBServicePlistName];
}

static napi_value KBStatus(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    if (@available(macOS 13.0, *)) {
      return KBString(env, KBStatusName(KBService().status));
    }
    KBThrow(env, @"SMAppService requires macOS 13 or later");
    return nullptr;
  }
}

static napi_value KBRegister(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    if (@available(macOS 13.0, *)) {
      NSError *error = nil;
      SMAppService *service = KBService();
      if (![service registerAndReturnError:&error]) {
        NSString *message = [NSString
            stringWithFormat:@"SMAppService register failed (%@/%ld): %@",
                             error.domain ?: @"unknown", (long)error.code,
                             error.localizedDescription ?: @"unknown error"];
        KBThrow(env, message);
        return nullptr;
      }
      return KBString(env, KBStatusName(service.status));
    }
    KBThrow(env, @"SMAppService requires macOS 13 or later");
    return nullptr;
  }
}

static napi_value KBUnregister(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    if (@available(macOS 13.0, *)) {
      NSError *error = nil;
      SMAppService *service = KBService();
      if (![service unregisterAndReturnError:&error]) {
        NSString *message = [NSString
            stringWithFormat:@"SMAppService unregister failed (%@/%ld): %@",
                             error.domain ?: @"unknown", (long)error.code,
                             error.localizedDescription ?: @"unknown error"];
        KBThrow(env, message);
        return nullptr;
      }
      return KBString(env, KBStatusName(service.status));
    }
    KBThrow(env, @"SMAppService requires macOS 13 or later");
    return nullptr;
  }
}

static napi_value KBReload(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    if (@available(macOS 13.0, *)) {
      SMAppService *service = KBService();
      SMAppServiceStatus status = service.status;
      if (status == SMAppServiceStatusRequiresApproval) {
        return KBString(env, KBStatusName(status));
      }

      NSError *error = nil;
      if (status == SMAppServiceStatusEnabled &&
          ![service unregisterAndReturnError:&error]) {
        NSString *message = [NSString
            stringWithFormat:@"SMAppService reload unregister failed (%@/%ld): %@",
                             error.domain ?: @"unknown", (long)error.code,
                             error.localizedDescription ?: @"unknown error"];
        KBThrow(env, message);
        return nullptr;
      }

      error = nil;
      if (![service registerAndReturnError:&error]) {
        status = service.status;
        if (status == SMAppServiceStatusRequiresApproval) {
          return KBString(env, KBStatusName(status));
        }
        NSString *message = [NSString
            stringWithFormat:@"SMAppService reload register failed (%@/%ld): %@",
                             error.domain ?: @"unknown", (long)error.code,
                             error.localizedDescription ?: @"unknown error"];
        KBThrow(env, message);
        return nullptr;
      }
      return KBString(env, KBStatusName(service.status));
    }
    KBThrow(env, @"SMAppService requires macOS 13 or later");
    return nullptr;
  }
}

static napi_value KBOpenSystemSettings(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    if (@available(macOS 13.0, *)) {
      [SMAppService openSystemSettingsLoginItems];
      napi_value result;
      napi_get_undefined(env, &result);
      return result;
    }
    KBThrow(env, @"SMAppService requires macOS 13 or later");
    return nullptr;
  }
}

static napi_value KBInitialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"status", nullptr, KBStatus, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"register", nullptr, KBRegister, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"unregister", nullptr, KBUnregister, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"reload", nullptr, KBReload, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"openSystemSettings", nullptr, KBOpenSystemSettings, nullptr, nullptr, nullptr, napi_default,
       nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, KBInitialize)
