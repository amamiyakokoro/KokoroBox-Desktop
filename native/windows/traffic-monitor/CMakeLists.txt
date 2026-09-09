cmake_minimum_required(VERSION 3.24)
project(KokoroBoxTrafficPlugin LANGUAGES CXX)

add_library(KokoroBoxTrafficPlugin SHARED KokoroBoxTrafficPlugin.cpp)
target_compile_features(KokoroBoxTrafficPlugin PRIVATE cxx_std_20)
target_compile_definitions(
  KokoroBoxTrafficPlugin
  PRIVATE UNICODE _UNICODE WINVER=0x0601 _WIN32_WINNT=0x0601
)
set_target_properties(
  KokoroBoxTrafficPlugin
  PROPERTIES PREFIX "" OUTPUT_NAME "KokoroBoxTrafficPlugin"
)

if(MSVC)
  target_compile_options(KokoroBoxTrafficPlugin PRIVATE /W4 /WX /wd4265 /permissive- /utf-8)
endif()
