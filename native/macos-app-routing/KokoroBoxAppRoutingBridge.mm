#include <node_api.h>

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <NetworkExtension/NetworkExtension.h>
#import <SystemExtensions/SystemExtensions.h>

#include <memory>
#include <string>

static const NSInteger KBProtocolVersion = 1;
static const size_t KBMaximumRequestBytes = 256 * 1024;
static NSString *const KBExtensionIdentifier = @"com.amamiyakokoro.app.proxy-extension";
static NSString *const KBManagerDescription = @"KokoroBox Application Routing";
static NSString *const KBErrorDomain = @"com.amamiyakokoro.app.routing-bridge";
static NSString *const KBAppGroupIdentifier = @"group.com.amamiyakokoro.app";
static NSString *const KBPolicyNotificationName =
    @"com.amamiyakokoro.app.routing-policy.changed";
static NSString *const KBPolicyFilename = @"application-routing-policy.json";
static NSString *const KBPolicyAcknowledgementFilename =
    @"application-routing-policy-ack.json";
static NSString *const KBUserApprovalPendingDefaultsKey =
    @"KokoroBoxApplicationRoutingUserApprovalPending";

static NSError *KBError(NSString *message) {
  return [NSError errorWithDomain:KBErrorDomain
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey : message}];
}

static BOOL KBUserApprovalPending(void) {
  return [[NSUserDefaults standardUserDefaults] boolForKey:KBUserApprovalPendingDefaultsKey];
}

static void KBSetUserApprovalPending(BOOL pending) {
  [[NSUserDefaults standardUserDefaults] setBool:pending
                                          forKey:KBUserApprovalPendingDefaultsKey];
}

static BOOL KBWait(dispatch_semaphore_t semaphore, NSTimeInterval seconds) {
  return dispatch_semaphore_wait(
             semaphore,
             dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC))) == 0;
}

@interface KBExtensionActivationDelegate : NSObject <OSSystemExtensionRequestDelegate>
@property(nonatomic) dispatch_semaphore_t semaphore;
@property(nonatomic, strong, nullable) NSError *error;
@property(nonatomic) BOOL needsUserApproval;
@property(nonatomic) BOOL signaled;
@end

@implementation KBExtensionActivationDelegate
- (instancetype)init {
  self = [super init];
  if (self) self.semaphore = dispatch_semaphore_create(0);
  return self;
}

- (void)signalOnce {
  if (self.signaled) return;
  self.signaled = YES;
  dispatch_semaphore_signal(self.semaphore);
}

- (void)requestNeedsUserApproval:(OSSystemExtensionRequest *)request {
  self.needsUserApproval = YES;
  [self signalOnce];
}

- (OSSystemExtensionReplacementAction)request:(OSSystemExtensionRequest *)request
                 actionForReplacingExtension:(OSSystemExtensionProperties *)existing
                               withExtension:(OSSystemExtensionProperties *)extension {
  return OSSystemExtensionReplacementActionReplace;
}

- (void)request:(OSSystemExtensionRequest *)request
    didFinishWithResult:(OSSystemExtensionRequestResult)result {
  [self signalOnce];
}

- (void)request:(OSSystemExtensionRequest *)request didFailWithError:(NSError *)error {
  self.error = error;
  [self signalOnce];
}
@end

static NSString *KBStatusName(NEVPNStatus status) {
  switch (status) {
  case NEVPNStatusInvalid:
  case NEVPNStatusDisconnected:
    return @"disabled";
  case NEVPNStatusConnecting:
  case NEVPNStatusReasserting:
    return @"starting";
  case NEVPNStatusConnected:
    return @"running";
  case NEVPNStatusDisconnecting:
    return @"stopping";
  }
  return @"error";
}

static BOOL KBActivateExtension(BOOL *needsUserApproval, NSError **error) {
  KBExtensionActivationDelegate *delegate = [[KBExtensionActivationDelegate alloc] init];
  dispatch_queue_t queue = dispatch_queue_create(
      "com.amamiyakokoro.app.routing-bridge.system-extension", DISPATCH_QUEUE_SERIAL);
  OSSystemExtensionRequest *request =
      [OSSystemExtensionRequest activationRequestForExtension:KBExtensionIdentifier queue:queue];
  request.delegate = delegate;
  [[OSSystemExtensionManager sharedManager] submitRequest:request];
  if (!KBWait(delegate.semaphore, 30)) {
    if (error) *error = KBError(@"The macOS System Extension operation timed out");
    return NO;
  }
  if (delegate.needsUserApproval) {
    KBSetUserApprovalPending(YES);
    if (needsUserApproval) *needsUserApproval = YES;
    return YES;
  }
  if (delegate.error) {
    if (error) *error = delegate.error;
    return NO;
  }
  KBSetUserApprovalPending(NO);
  if (needsUserApproval) *needsUserApproval = NO;
  return YES;
}

static NSArray<NETransparentProxyManager *> *KBLoadManagers(NSError **error) {
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  __block NSArray<NETransparentProxyManager *> *loaded = nil;
  __block NSError *loadError = nil;
  [NETransparentProxyManager
      loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETransparentProxyManager *> *managers,
                                                     NSError *managerError) {
        loaded = managers ?: @[];
        loadError = managerError;
        dispatch_semaphore_signal(semaphore);
      }];
  if (!KBWait(semaphore, 15)) {
    if (error) *error = KBError(@"Loading transparent proxy preferences timed out");
    return nil;
  }
  if (loadError) {
    if (error) *error = loadError;
    return nil;
  }
  return loaded;
}

static NETransparentProxyManager *KBLoadManager(NSError **error) {
  NSArray<NETransparentProxyManager *> *managers = KBLoadManagers(error);
  if (!managers) return nil;
  for (NETransparentProxyManager *manager in managers) {
    NETunnelProviderProtocol *protocol =
        (NETunnelProviderProtocol *)manager.protocolConfiguration;
    if ([protocol isKindOfClass:[NETunnelProviderProtocol class]] &&
        [protocol.providerBundleIdentifier isEqualToString:KBExtensionIdentifier]) {
      return manager;
    }
  }
  return nil;
}

static BOOL KBSaveManager(NETransparentProxyManager *manager, NSError **error) {
  dispatch_semaphore_t saveSemaphore = dispatch_semaphore_create(0);
  __block NSError *saveError = nil;
  [manager saveToPreferencesWithCompletionHandler:^(NSError *managerError) {
    saveError = managerError;
    dispatch_semaphore_signal(saveSemaphore);
  }];
  if (!KBWait(saveSemaphore, 15)) {
    if (error) *error = KBError(@"Saving transparent proxy preferences timed out");
    return NO;
  }
  if (saveError) {
    if (error) *error = saveError;
    return NO;
  }

  dispatch_semaphore_t loadSemaphore = dispatch_semaphore_create(0);
  __block NSError *loadError = nil;
  [manager loadFromPreferencesWithCompletionHandler:^(NSError *managerError) {
    loadError = managerError;
    dispatch_semaphore_signal(loadSemaphore);
  }];
  if (!KBWait(loadSemaphore, 15)) {
    if (error) *error = KBError(@"Reloading transparent proxy preferences timed out");
    return NO;
  }
  if (loadError) {
    if (error) *error = loadError;
    return NO;
  }
  return YES;
}

static BOOL KBValidateConfiguration(NSDictionary *configuration, NSError **error) {
  NSNumber *version = configuration[@"version"];
  NSNumber *failClosed = configuration[@"failClosed"];
  NSString *proxyHost = configuration[@"proxyHost"];
  NSNumber *proxyPort = configuration[@"proxyPort"];
  NSArray *rules = configuration[@"rules"];
  if (![version isKindOfClass:[NSNumber class]] || version.integerValue != KBProtocolVersion ||
      ![failClosed isKindOfClass:[NSNumber class]] || !failClosed.boolValue ||
      ![proxyHost isEqualToString:@"127.0.0.1"] || proxyPort.integerValue != 7891 ||
      ![rules isKindOfClass:[NSArray class]] || rules.count > 256) {
    if (error) *error = KBError(@"Invalid application-routing configuration");
    return NO;
  }
  return YES;
}

static BOOL KBSendConfiguration(NSDictionary *configuration,
                                NETransparentProxyManager *manager,
                                NSError **error) {
  if (![manager.connection isKindOfClass:[NETunnelProviderSession class]]) {
    if (error) *error = KBError(@"The transparent proxy provider is unavailable");
    return NO;
  }
  NSURL *containerURL = [[NSFileManager defaultManager]
      containerURLForSecurityApplicationGroupIdentifier:KBAppGroupIdentifier];
  if (!containerURL) {
    if (error) *error = KBError(@"The application-routing App Group is unavailable");
    return NO;
  }
  NSURL *policyURL = [containerURL URLByAppendingPathComponent:KBPolicyFilename];
  NSURL *acknowledgementURL =
      [containerURL URLByAppendingPathComponent:KBPolicyAcknowledgementFilename];
  NSString *revision = NSUUID.UUID.UUIDString;
  NSDictionary *envelope = @{
    @"version" : @(KBProtocolVersion),
    @"revision" : revision,
    @"configuration" : configuration
  };
  NSData *policyData =
      [NSJSONSerialization dataWithJSONObject:envelope options:0 error:error];
  if (!policyData || ![policyData writeToURL:policyURL options:NSDataWritingAtomic error:error]) {
    return NO;
  }
  [[NSFileManager defaultManager] removeItemAtURL:acknowledgementURL error:nil];

  // NETunnelProviderSession callbacks are unreliable when invoked through an
  // Electron N-API worker. Exchange the policy through the signed App Group
  // instead, notify the running provider, and require an acknowledgement with
  // the same one-time revision before accepting the update.
  const NSUInteger maximumAttempts = 3;
  for (NSUInteger attempt = 0; attempt < maximumAttempts; ++attempt) {
    CFNotificationCenterPostNotification(
        CFNotificationCenterGetDarwinNotifyCenter(),
        (__bridge CFNotificationName)KBPolicyNotificationName,
        NULL,
        NULL,
        true);
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:2];
    while (deadline.timeIntervalSinceNow > 0) {
      NSData *acknowledgementData = [NSData dataWithContentsOfURL:acknowledgementURL];
      id decoded = acknowledgementData
                       ? [NSJSONSerialization JSONObjectWithData:acknowledgementData
                                                         options:0
                                                           error:nil]
                       : nil;
      NSDictionary *acknowledgement =
          [decoded isKindOfClass:[NSDictionary class]] ? decoded : nil;
      if ([acknowledgement[@"revision"] isEqualToString:revision] &&
          [acknowledgement[@"version"] integerValue] == KBProtocolVersion) {
        if ([acknowledgement[@"status"] isEqualToString:@"ok"]) return YES;
        if (error) {
          *error = KBError(@"The network extension rejected the application-routing policy");
        }
        return NO;
      }
      [NSThread sleepForTimeInterval:0.05];
    }
  }
  if (error) {
    *error = KBError(@"The network extension did not acknowledge the application-routing policy");
  }
  return NO;
}

static NSDictionary *KBStoredConfiguration(NETransparentProxyManager *manager) {
  NETunnelProviderProtocol *protocol =
      (NETunnelProviderProtocol *)manager.protocolConfiguration;
  if (![protocol isKindOfClass:[NETunnelProviderProtocol class]] ||
      ![protocol.providerBundleIdentifier isEqualToString:KBExtensionIdentifier]) {
    return nil;
  }
  id stored = protocol.providerConfiguration[@"kokoroBoxConfiguration"];
  if ([stored isKindOfClass:[NSDictionary class]]) return stored;
  if (![stored isKindOfClass:[NSData class]]) return nil;
  id decoded = [NSJSONSerialization JSONObjectWithData:stored options:0 error:nil];
  return [decoded isKindOfClass:[NSDictionary class]] ? decoded : nil;
}

static void KBClearSharedPolicy(void) {
  NSURL *containerURL = [[NSFileManager defaultManager]
      containerURLForSecurityApplicationGroupIdentifier:KBAppGroupIdentifier];
  if (!containerURL) return;
  NSFileManager *files = [NSFileManager defaultManager];
  [files removeItemAtURL:[containerURL URLByAppendingPathComponent:KBPolicyFilename]
                   error:nil];
  [files removeItemAtURL:
             [containerURL URLByAppendingPathComponent:KBPolicyAcknowledgementFilename]
                   error:nil];
}

static NSString *KBApply(NSDictionary *configuration, NSError **error) {
  if (!KBValidateConfiguration(configuration, error)) return nil;
  NETransparentProxyManager *manager = KBLoadManager(error);
  if (!manager && error && *error) return nil;
  if (!manager) manager = [[NETransparentProxyManager alloc] init];

  NSString *currentState = KBStatusName(manager.connection.status);
  NSDictionary *storedConfiguration = KBStoredConfiguration(manager);
  if ([storedConfiguration isEqualToDictionary:configuration] &&
      ([currentState isEqualToString:@"running"] ||
       [currentState isEqualToString:@"starting"])) {
    // The initial apply stores this exact policy before startVPNTunnel. Avoid a
    // redundant provider message both during startup and after an app restart.
    // The provider reads the policy from providerConfiguration in startProxy.
    return currentState;
  }

  if (manager.connection.status == NEVPNStatusConnected) {
    if (!KBSendConfiguration(configuration, manager, error)) return nil;
  }

  NSData *configurationData =
      [NSJSONSerialization dataWithJSONObject:configuration options:0 error:error];
  if (!configurationData) return nil;
  NETunnelProviderProtocol *protocol = [[NETunnelProviderProtocol alloc] init];
  protocol.providerBundleIdentifier = KBExtensionIdentifier;
  protocol.serverAddress = @"127.0.0.1:7891";
  protocol.providerConfiguration = @{@"kokoroBoxConfiguration" : configurationData};
  manager.protocolConfiguration = protocol;
  manager.localizedDescription = KBManagerDescription;
  manager.enabled = YES;
  if (!KBSaveManager(manager, error)) return nil;

  if (manager.connection.status == NEVPNStatusDisconnected ||
      manager.connection.status == NEVPNStatusInvalid) {
    // A policy envelope belongs to a running provider instance. Remove an old
    // envelope before a cold start so the providerConfiguration saved above
    // cannot be overwritten by stale App Group state.
    KBClearSharedPolicy();
    NSError *startError = nil;
    if (![manager.connection startVPNTunnelAndReturnError:&startError]) {
      if (error) *error = startError ?: KBError(@"Starting the transparent proxy failed");
      return nil;
    }
  }
  NSString *state = KBStatusName(manager.connection.status);
  if ([state isEqualToString:@"running"]) KBSetUserApprovalPending(NO);
  return state;
}

static NSString *KBStop(NSError **error) {
  NETransparentProxyManager *manager = KBLoadManager(error);
  if (!manager && error && *error) return nil;
  if (!manager) return @"disabled";
  [manager.connection stopVPNTunnel];
  manager.enabled = NO;
  return KBSaveManager(manager, error) ? @"disabled" : nil;
}

static NSString *KBCurrentStatus(NSError **error) {
  NETransparentProxyManager *manager = KBLoadManager(error);
  if (!manager && error && *error) return nil;
  if (!manager || !manager.enabled) return @"disabled";
  NSString *state = KBStatusName(manager.connection.status);
  if ([state isEqualToString:@"running"]) KBSetUserApprovalPending(NO);
  return state;
}

static NSDictionary *KBInvoke(NSDictionary *request, NSError **error) {
  if (![request isKindOfClass:[NSDictionary class]] ||
      [request[@"version"] integerValue] != KBProtocolVersion ||
      ![request[@"command"] isKindOfClass:[NSString class]]) {
    if (error) *error = KBError(@"Invalid bridge request");
    return nil;
  }

  NSString *command = request[@"command"];
  NSString *state = nil;
  BOOL needsUserApproval = KBUserApprovalPending();
  if ([command isEqualToString:@"apply"]) {
    NSDictionary *configuration = request[@"configuration"];
    BOOL activationNeedsUserApproval = NO;
    if (![configuration isKindOfClass:[NSDictionary class]] ||
        !KBActivateExtension(&activationNeedsUserApproval, error)) {
      if (error && !*error) *error = KBError(@"Invalid bridge request");
      return nil;
    }
    needsUserApproval = KBUserApprovalPending() || activationNeedsUserApproval;
    // macOS requires explicit user consent. Do not block Electron while the consent sheet is open,
    // and do not create an enabled transparent-proxy manager until the extension is approved.
    state = needsUserApproval ? @"starting" : KBApply(configuration, error);
  } else if ([command isEqualToString:@"stop"]) {
    state = KBStop(error);
  } else if ([command isEqualToString:@"status"]) {
    state = KBCurrentStatus(error);
  } else if ([command isEqualToString:@"open-settings"]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      NSWorkspace *workspace = [NSWorkspace sharedWorkspace];
      // Help Viewer actions are not Launch Services URLs. Address System
      // Settings directly and check for a handler before opening the URL.
      NSURL *url = [NSURL URLWithString:
          @"x-apple.systempreferences:com.apple.LoginItems-Settings.extension"];
      if (!url || ![workspace URLForApplicationToOpenURL:url] || ![workspace openURL:url]) {
        [workspace openURL:[NSURL fileURLWithPath:@"/System/Applications/System Settings.app"]];
      }
    });
    state = @"starting";
  } else {
    if (error) *error = KBError(@"Invalid bridge request");
    return nil;
  }

  if (!state) return nil;
  if ([state isEqualToString:@"running"]) KBSetUserApprovalPending(NO);
  needsUserApproval = KBUserApprovalPending();
  return @{
    @"version" : @(KBProtocolVersion),
    @"ok" : @YES,
    @"state" : state,
    @"needsUserApproval" : @(needsUserApproval)
  };
}

struct KBWork {
  napi_async_work asyncWork = nullptr;
  napi_deferred deferred = nullptr;
  std::string request;
  std::string response;
  std::string error;
};

static void KBExecute(napi_env env, void *data) {
  KBWork *work = static_cast<KBWork *>(data);
  @autoreleasepool {
    NSData *input = [NSData dataWithBytes:work->request.data() length:work->request.size()];
    NSError *error = nil;
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:input options:0 error:&error];
    NSDictionary *response = error ? nil : KBInvoke(request, &error);
    if (!response) {
      work->error = (error.localizedDescription ?: @"macOS application routing failed").UTF8String;
      return;
    }
    NSData *output = [NSJSONSerialization dataWithJSONObject:response options:0 error:&error];
    if (!output) {
      work->error = (error.localizedDescription ?: @"Encoding bridge response failed").UTF8String;
      return;
    }
    work->response.assign(static_cast<const char *>(output.bytes), output.length);
  }
}

static void KBComplete(napi_env env, napi_status status, void *data) {
  std::unique_ptr<KBWork> work(static_cast<KBWork *>(data));
  napi_value value;
  if (status != napi_ok || !work->error.empty()) {
    const std::string &message =
        work->error.empty() ? std::string("macOS application-routing work failed") : work->error;
    napi_create_string_utf8(env, message.c_str(), message.size(), &value);
    napi_value error;
    napi_create_error(env, nullptr, value, &error);
    napi_reject_deferred(env, work->deferred, error);
  } else {
    napi_create_string_utf8(env, work->response.c_str(), work->response.size(), &value);
    napi_resolve_deferred(env, work->deferred, value);
  }
  napi_delete_async_work(env, work->asyncWork);
}

static napi_value KBInvokeAsync(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_valuetype type = napi_undefined;
  if (argc != 1 || napi_typeof(env, args[0], &type) != napi_ok || type != napi_string) {
    napi_throw_type_error(env, nullptr, "invoke expects one JSON string");
    return nullptr;
  }
  size_t size = 0;
  napi_get_value_string_utf8(env, args[0], nullptr, 0, &size);
  if (size == 0 || size > KBMaximumRequestBytes) {
    napi_throw_range_error(env, nullptr, "bridge request size is invalid");
    return nullptr;
  }

  std::unique_ptr<KBWork> work = std::make_unique<KBWork>();
  work->request.resize(size + 1);
  size_t copied = 0;
  napi_get_value_string_utf8(env, args[0], work->request.data(), size + 1, &copied);
  work->request.resize(copied);

  napi_value promise;
  napi_create_promise(env, &work->deferred, &promise);
  napi_value resourceName;
  napi_create_string_utf8(env, "KokoroBoxApplicationRouting", NAPI_AUTO_LENGTH, &resourceName);
  napi_create_async_work(env, nullptr, resourceName, KBExecute, KBComplete, work.get(),
                         &work->asyncWork);
  napi_queue_async_work(env, work->asyncWork);
  work.release();
  return promise;
}

static napi_value KBInitialize(napi_env env, napi_value exports) {
  napi_value function;
  napi_create_function(env, "invoke", NAPI_AUTO_LENGTH, KBInvokeAsync, nullptr, &function);
  napi_set_named_property(env, exports, "invoke", function);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, KBInitialize)
