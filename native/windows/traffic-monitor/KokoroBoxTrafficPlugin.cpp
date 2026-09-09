#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <atomic>
#include <charconv>
#include <chrono>
#include <cstdint>
#include <cwchar>
#include <iterator>
#include <string>
#include <string_view>
#include <thread>

#include "PluginInterface.h"

namespace {
constexpr wchar_t kDefaultPipePath[] = L"\\\\.\\pipe\\KokoroBox\\mihomo";
constexpr char kTrafficRequest[] = "GET /traffic HTTP/1.1\r\nHost: TrafficMonitor\r\n\r\n";

std::wstring GetPipePath() {
  const DWORD required = GetEnvironmentVariableW(L"KOKOROBOX_MIHOMO_PIPE", nullptr, 0);
  if (required <= 1) return kDefaultPipePath;

  std::wstring value(required, L'\0');
  const DWORD written = GetEnvironmentVariableW(
      L"KOKOROBOX_MIHOMO_PIPE", value.data(), static_cast<DWORD>(value.size()));
  if (written == 0 || written >= static_cast<DWORD>(value.size())) return kDefaultPipePath;
  value.resize(written);
  return value;
}

bool ParseUnsigned(std::string_view input, std::string_view key, std::uint64_t& output) {
  const auto key_position = input.rfind(key);
  if (key_position == std::string_view::npos) return false;
  auto position = input.find(':', key_position + key.size());
  if (position == std::string_view::npos) return false;
  ++position;
  while (position < input.size() && (input[position] == ' ' || input[position] == '\t')) {
    ++position;
  }

  const char* begin = input.data() + position;
  const char* end = input.data() + input.size();
  std::uint64_t value = 0;
  const auto result = std::from_chars(begin, end, value);
  if (result.ec != std::errc{}) return false;
  output = value;
  return true;
}

void FormatSpeed(std::uint64_t bytes_per_second, wchar_t* output, std::size_t length) {
  constexpr double kUnit = 1024.0;
  const wchar_t* suffix = L"B/s";
  double value = static_cast<double>(bytes_per_second);
  if (value >= kUnit * kUnit * kUnit) {
    value /= kUnit * kUnit * kUnit;
    suffix = L"GB/s";
  } else if (value >= kUnit * kUnit) {
    value /= kUnit * kUnit;
    suffix = L"MB/s";
  } else if (value >= kUnit) {
    value /= kUnit;
    suffix = L"KB/s";
  }

  if (value >= 100.0 || bytes_per_second < 1024) {
    swprintf_s(output, length, L"%.0f %s", value, suffix);
  } else {
    swprintf_s(output, length, L"%.2f %s", value, suffix);
  }
}

class SpeedItem final : public IPluginItem {
 public:
  SpeedItem(const wchar_t* name, const wchar_t* id, const wchar_t* label)
      : name_(name), id_(id), label_(label) {
    FormatSpeed(0, value_, std::size(value_));
  }

  void SetValue(std::uint64_t value) { FormatSpeed(value, value_, std::size(value_)); }
  const wchar_t* GetItemName() const override { return name_; }
  const wchar_t* GetItemId() const override { return id_; }
  const wchar_t* GetItemLableText() const override { return label_; }
  const wchar_t* GetItemValueText() const override { return value_; }
  const wchar_t* GetItemValueSampleText() const override { return L"00.00 MB/s"; }

 private:
  const wchar_t* name_;
  const wchar_t* id_;
  const wchar_t* label_;
  wchar_t value_[32]{};
};

class KokoroBoxTrafficPlugin final : public ITMPlugin {
 public:
  KokoroBoxTrafficPlugin()
      : upload_item_(L"KokoroBox upload", L"KokoroBoxUploadSpeed", L"↑"),
        download_item_(L"KokoroBox download", L"KokoroBoxDownloadSpeed", L"↓") {}

  ~KokoroBoxTrafficPlugin() { StopWorker(); }

  IPluginItem* GetItem(int index) override {
    if (index == 0) return &upload_item_;
    if (index == 1) return &download_item_;
    return nullptr;
  }

  void DataRequired() override {
    upload_item_.SetValue(upload_.load(std::memory_order_relaxed));
    download_item_.SetValue(download_.load(std::memory_order_relaxed));
  }

  const wchar_t* GetInfo(PluginInfoIndex index) override {
    switch (index) {
      case TMI_NAME:
        return L"KokoroBox Traffic";
      case TMI_DESCRIPTION:
        return L"Displays Mihomo /traffic upload and download speeds";
      case TMI_AUTHOR:
        return L"KokoroBox contributors";
      case TMI_COPYRIGHT:
        return L"Copyright (C) KokoroBox contributors";
      case TMI_VERSION:
        return L"1.0.0";
      case TMI_URL:
        return L"https://github.com/amamiyakokoro/KokoroBox-Desktop";
      case TMI_MAX:
      default:
        return L"";
    }
  }

  const wchar_t* GetTooltipInfo() override {
    return connected_.load(std::memory_order_relaxed)
               ? L"Mihomo /traffic connected"
               : L"Waiting for KokoroBox Mihomo /traffic";
  }

  void OnInitialize(ITrafficMonitor*) override {
    if (!worker_.joinable()) worker_ = std::thread([this] { WorkerLoop(); });
  }

 private:
  void StopWorker() {
    stopping_.store(true, std::memory_order_relaxed);
    if (worker_.joinable()) {
      CancelSynchronousIo(static_cast<HANDLE>(worker_.native_handle()));
      worker_.join();
    }
  }

  bool ShouldStop() const { return stopping_.load(std::memory_order_relaxed); }

  void RetryDelay() const {
    for (int i = 0; i < 10 && !ShouldStop(); ++i) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  }

  void WorkerLoop() {
    const std::wstring pipe_path = GetPipePath();
    while (!ShouldStop()) {
      if (!WaitNamedPipeW(pipe_path.c_str(), 500)) {
        connected_.store(false, std::memory_order_relaxed);
        RetryDelay();
        continue;
      }

      HANDLE pipe = CreateFileW(pipe_path.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr,
                                OPEN_EXISTING, 0, nullptr);
      if (pipe == INVALID_HANDLE_VALUE) {
        connected_.store(false, std::memory_order_relaxed);
        RetryDelay();
        continue;
      }

      DWORD written = 0;
      if (!WriteFile(pipe, kTrafficRequest, static_cast<DWORD>(sizeof(kTrafficRequest) - 1),
                     &written, nullptr)) {
        CloseHandle(pipe);
        connected_.store(false, std::memory_order_relaxed);
        RetryDelay();
        continue;
      }

      connected_.store(true, std::memory_order_relaxed);
      std::string response;
      char buffer[4096];
      while (!ShouldStop()) {
        DWORD received = 0;
        if (!ReadFile(pipe, buffer, sizeof(buffer), &received, nullptr) || received == 0) break;
        response.append(buffer, received);

        std::uint64_t upload = 0;
        std::uint64_t download = 0;
        if (ParseUnsigned(response, "\"up\"", upload) &&
            ParseUnsigned(response, "\"down\"", download)) {
          upload_.store(upload, std::memory_order_relaxed);
          download_.store(download, std::memory_order_relaxed);
        }
        if (response.size() > 65536) response.erase(0, response.size() - 4096);
      }

      CloseHandle(pipe);
      connected_.store(false, std::memory_order_relaxed);
      if (!ShouldStop()) RetryDelay();
    }
  }

  SpeedItem upload_item_;
  SpeedItem download_item_;
  std::atomic<std::uint64_t> upload_{0};
  std::atomic<std::uint64_t> download_{0};
  std::atomic<bool> connected_{false};
  std::atomic<bool> stopping_{false};
  std::thread worker_;
};

KokoroBoxTrafficPlugin g_plugin;
}  // namespace

extern "C" __declspec(dllexport) ITMPlugin* TMPluginGetInstance() { return &g_plugin; }

#if defined(_M_IX86)
#pragma comment(linker, "/EXPORT:TMPluginGetInstance=_TMPluginGetInstance")
#endif
