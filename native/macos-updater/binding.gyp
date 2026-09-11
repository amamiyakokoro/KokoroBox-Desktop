{
  "targets": [
    {
      "target_name": "kokorobox_updater",
      "sources": ["KokoroBoxUpdaterBridge.mm"],
      "cflags": ["-F<(module_root_dir)/../../extra/macos-updater"],
      "libraries": [
        "-F<(module_root_dir)/../../extra/macos-updater",
        "-framework AppKit",
        "-framework Foundation",
        "-framework Sparkle"
      ],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "MACOSX_DEPLOYMENT_TARGET": "13.0",
        "LD_RUNPATH_SEARCH_PATHS": ["@loader_path"],
        "OTHER_LDFLAGS": ["-framework AppKit", "-framework Foundation", "-framework Sparkle"]
      }
    }
  ]
}
