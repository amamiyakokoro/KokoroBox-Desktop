#include <node_api.h>

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#define BUILDING_SPARKLE_SOURCES_EXTERNALLY 1
#import "../../extra/macos-updater/Sparkle.framework/Headers/SPUStandardUpdaterController.h"
#import "../../extra/macos-updater/Sparkle.framework/Headers/SPUUpdater.h"
#import "../../extra/macos-updater/Sparkle.framework/Headers/SPUUpdaterDelegate.h"

static SPUStandardUpdaterController *KBUpdaterController = nil;
static NSString *KBUpdateChannel = nil;

static void KBThrow(napi_env env, NSString *message) {
  napi_throw_error(env, nullptr, message.UTF8String);
}

static BOOL KBRequireMainThread(napi_env env) {
  if ([NSThread isMainThread]) return YES;
  KBThrow(env, @"The macOS updater must be called from Electron's main thread");
  return NO;
}

static NSString *KBAppcastName(void) {
#if defined(__arm64__)
  return @"appcast-macos-arm64.xml";
#else
  return @"appcast-macos-x64.xml";
#endif
}

static NSString *KBFeedURLStringForChannel(NSString *channel) {
  NSString *releasePath = [channel isEqualToString:@"rolling"]
                              ? @"releases/download/rolling"
                              : @"releases/latest/download";
  return [NSString
      stringWithFormat:@"https://github.com/amamiyakokoro/KokoroBox-Desktop/%@/%@",
                       releasePath, KBAppcastName()];
}

static NSString *KBReadChannel(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_valuetype type = napi_undefined;
  if (argc < 1 || napi_typeof(env, args[0], &type) != napi_ok || type != napi_string) {
    napi_throw_type_error(env, nullptr, "update channel must be stable or rolling");
    return nil;
  }

  size_t length = 0;
  if (napi_get_value_string_utf8(env, args[0], nullptr, 0, &length) != napi_ok || length == 0 ||
      length >= 8) {
    napi_throw_range_error(env, nullptr, "invalid update channel");
    return nil;
  }
  char value[8] = {};
  size_t copied = 0;
  if (napi_get_value_string_utf8(env, args[0], value, sizeof(value), &copied) != napi_ok ||
      copied != length) {
    napi_throw_range_error(env, nullptr, "invalid update channel");
    return nil;
  }
  NSString *channel = [[NSString alloc] initWithBytes:value
                                               length:copied
                                             encoding:NSUTF8StringEncoding];
  if (![channel isEqualToString:@"stable"] && ![channel isEqualToString:@"rolling"]) {
    napi_throw_range_error(env, nullptr, "update channel must be stable or rolling");
    return nil;
  }
  return channel;
}

@interface KBUpdaterDelegate : NSObject <SPUUpdaterDelegate>
@end

@implementation KBUpdaterDelegate
- (NSString *)feedURLStringForUpdater:(SPUUpdater *)updater {
  return KBFeedURLStringForChannel(KBUpdateChannel ?: @"stable");
}
@end

static KBUpdaterDelegate *KBUpdaterDelegateInstance = nil;

static BOOL KBValidateConfiguration(napi_env env) {
  NSBundle *bundle = [NSBundle mainBundle];
  NSString *feed = [bundle objectForInfoDictionaryKey:@"SUFeedURL"];
  NSString *publicKey = [bundle objectForInfoDictionaryKey:@"SUPublicEDKey"];
  BOOL trustedFeed = [feed isKindOfClass:[NSString class]] &&
                     ([feed isEqualToString:KBFeedURLStringForChannel(@"stable")] ||
                      [feed isEqualToString:KBFeedURLStringForChannel(@"rolling")]);
  if (!trustedFeed) {
    KBThrow(env, @"The signed application does not contain a trusted Sparkle feed");
    return NO;
  }
  NSData *decodedPublicKey = [publicKey isKindOfClass:[NSString class]]
                                 ? [[NSData alloc] initWithBase64EncodedString:publicKey options:0]
                                 : nil;
  if (decodedPublicKey.length != 32) {
    KBThrow(env, @"The signed application does not contain a Sparkle public key");
    return NO;
  }
  return YES;
}

static napi_value KBCreateState(napi_env env) {
  napi_value state;
  napi_create_object(env, &state);

  napi_value available;
  napi_get_boolean(env, true, &available);
  napi_set_named_property(env, state, "available", available);

  napi_value initialized;
  napi_get_boolean(env, KBUpdaterController != nil, &initialized);
  napi_set_named_property(env, state, "initialized", initialized);

  napi_value canCheck;
  napi_get_boolean(env, KBUpdaterController != nil && KBUpdaterController.updater.canCheckForUpdates,
                   &canCheck);
  napi_set_named_property(env, state, "canCheckForUpdates", canCheck);
  return state;
}

static napi_value KBState(napi_env env, napi_callback_info info) {
  if (!KBRequireMainThread(env)) return nullptr;
  return KBCreateState(env);
}

static napi_value KBInitializeUpdater(napi_env env, napi_callback_info info) {
  if (!KBRequireMainThread(env) || !KBValidateConfiguration(env)) return nullptr;
  NSString *channel = KBReadChannel(env, info);
  if (!channel) return nullptr;
  @try {
    KBUpdateChannel = [channel copy];
    if (!KBUpdaterController) {
      KBUpdaterDelegateInstance = [[KBUpdaterDelegate alloc] init];
      KBUpdaterController = [[SPUStandardUpdaterController alloc]
          initWithStartingUpdater:NO
                 updaterDelegate:KBUpdaterDelegateInstance
              userDriverDelegate:nil];
      [KBUpdaterController startUpdater];
    }
    return KBCreateState(env);
  } @catch (NSException *exception) {
    KBThrow(env, exception.reason ?: @"Unable to initialize the macOS updater");
    return nullptr;
  }
}

static napi_value KBCheckForUpdates(napi_env env, napi_callback_info info) {
  if (!KBRequireMainThread(env)) return nullptr;
  NSString *channel = KBReadChannel(env, info);
  if (!channel) return nullptr;
  if (!KBUpdaterController) {
    KBThrow(env, @"The macOS updater has not been initialized");
    return nullptr;
  }
  @try {
    KBUpdateChannel = [channel copy];
    [KBUpdaterController checkForUpdates:nil];
    return KBCreateState(env);
  } @catch (NSException *exception) {
    KBThrow(env, exception.reason ?: @"Unable to check for macOS updates");
    return nullptr;
  }
}

static napi_value KBConfigureUpdater(napi_env env, napi_callback_info info) {
  if (!KBRequireMainThread(env)) return nullptr;
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_valuetype enabledType = napi_undefined;
  if (argc != 2 || napi_typeof(env, args[1], &enabledType) != napi_ok ||
      enabledType != napi_boolean) {
    napi_throw_type_error(env, nullptr, "automatic update checks must be a boolean");
    return nullptr;
  }
  NSString *channel = KBReadChannel(env, info);
  if (!channel) return nullptr;
  if (!KBUpdaterController) {
    KBThrow(env, @"The macOS updater has not been initialized");
    return nullptr;
  }
  bool enabled = false;
  if (napi_get_value_bool(env, args[1], &enabled) != napi_ok) {
    KBThrow(env, @"Unable to read automatic update preference");
    return nullptr;
  }
  @try {
    BOOL channelChanged = ![KBUpdateChannel isEqualToString:channel];
    KBUpdateChannel = [channel copy];
    SPUUpdater *updater = KBUpdaterController.updater;
    BOOL automaticChecksChanged = updater.automaticallyChecksForUpdates != enabled;
    if (automaticChecksChanged) updater.automaticallyChecksForUpdates = enabled;
    if (channelChanged && enabled && !automaticChecksChanged) {
      [updater resetUpdateCycleAfterShortDelay];
    }
    return KBCreateState(env);
  } @catch (NSException *exception) {
    KBThrow(env, exception.reason ?: @"Unable to configure the macOS updater");
    return nullptr;
  }
}

static napi_value KBInitialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"state", nullptr, KBState, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"initialize", nullptr, KBInitializeUpdater, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"configure", nullptr, KBConfigureUpdater, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"checkForUpdates", nullptr, KBCheckForUpdates, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, KBInitialize)
