{
  "targets": [
    {
      "target_name": "kokorobox_app_routing",
      "sources": ["KokoroBoxAppRoutingBridge.mm"],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "MACOSX_DEPLOYMENT_TARGET": "13.0",
        "OTHER_LDFLAGS": [
          "-framework AppKit",
          "-framework Foundation",
          "-framework NetworkExtension",
          "-framework SystemExtensions"
        ]
      }
    }
  ]
}
