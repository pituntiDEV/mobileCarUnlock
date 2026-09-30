#import "AppDelegate.h"

#import <React/RCTBridge.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTRootView.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <UserNotifications/UserNotifications.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"CarUnlock";
  self.initialProps = @{};

  // Configure notifications delegate if needed
  [UNUserNotificationCenter currentNotificationCenter].delegate = (id<UNUserNotificationCenterDelegate>)self;

  // Handle launch from Bluetooth central restoration or CoreLocation wake-up
  if ([launchOptions objectForKey:UIApplicationLaunchOptionsBluetoothCentralsKey]) {
    NSLog(@"[AppDelegate] App launched by iOS due to Bluetooth Central State Restoration!");
  }
  
  if ([launchOptions objectForKey:UIApplicationLaunchOptionsLocationKey]) {
    NSLog(@"[AppDelegate] App launched by iOS due to CoreLocation iBeacon Region Wakeup!");
  }

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
