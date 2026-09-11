{
  "targets": [
    {
      "target_name": "kokorobox_service_management",
      "sources": ["KokoroBoxServiceManagementBridge.mm"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "MACOSX_DEPLOYMENT_TARGET": "13.0",
        "OTHER_LDFLAGS": ["-framework Foundation", "-framework ServiceManagement"]
      }
    }
  ]
}
