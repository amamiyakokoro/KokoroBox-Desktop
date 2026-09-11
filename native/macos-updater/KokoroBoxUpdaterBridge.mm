#include <node_api.h>

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#define BUILDING_SPARKLE_SOURCES_EXTERNALLY 1
#import "../../extra/macos-updater/Sparkle.framework/Headers/SPUStandardUpdaterController.h"
#import "../../extra/macos-updater/Sparkle.framework/Headers/SPUUpdater.h"

static SPUStandardUpdaterController *KBUpdaterController = nil;

static void KBThrow(napi_env env, NSString *message) {
  napi_throw_error(env, nullptr, message.UTF8String);
}

static BOOL KBRequireMainThread(napi_env env) {
  if ([NSThread isMainThread]) return YES;
  KBThrow(env, @"The macOS updater must be called from Electron's main thread");
  return NO;
}

static BOOL KBValidateConfiguration(napi_env env) {
  NSBundle *bundle = [NSBundle mainBundle];
  NSString *feed = [bundle objectForInfoDictionaryKey:@"SUFeedURL"];
  NSString *publicKey = [bundle objectForInfoDictionaryKey:@"SUPublicEDKey"];
  NSURL *feedURL = [feed isKindOfClass:[NSString class]] ? [NSURL URLWithString:feed] : nil;
  if (!feedURL || ![feedURL.scheme.lowercaseString isEqualToString:@"https"]) {
    KBThrow(env, @"The signed application does not contain a valid HTTPS Sparkle feed");
    return NO;
  }
  if (![publicKey isKindOfClass:[NSString class]] || publicKey.length == 0) {
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
  @try {
    if (!KBUpdaterController) {
      KBUpdaterController = [[SPUStandardUpdaterController alloc]
          initWithStartingUpdater:NO
                 updaterDelegate:nil
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
  if (!KBUpdaterController) {
    KBThrow(env, @"The macOS updater has not been initialized");
    return nullptr;
  }
  @try {
    [KBUpdaterController checkForUpdates:nil];
    return KBCreateState(env);
  } @catch (NSException *exception) {
    KBThrow(env, exception.reason ?: @"Unable to check for macOS updates");
    return nullptr;
  }
}

static napi_value KBInitialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"state", nullptr, KBState, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"initialize", nullptr, KBInitializeUpdater, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"checkForUpdates", nullptr, KBCheckForUpdates, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, KBInitialize)
