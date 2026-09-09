// Minimal ABI-compatible subset of TrafficMonitor's MIT-licensed plugin SDK.
// Upstream: https://github.com/zhongyang219/TrafficMonitorPlugins
#pragma once

class IPluginItem {
 public:
  virtual const wchar_t* GetItemName() const = 0;
  virtual const wchar_t* GetItemId() const = 0;
  virtual const wchar_t* GetItemLableText() const = 0;
  virtual const wchar_t* GetItemValueText() const = 0;
  virtual const wchar_t* GetItemValueSampleText() const = 0;
  virtual bool IsCustomDraw() const { return false; }
  virtual int GetItemWidth() const { return 0; }
  virtual void DrawItem(void*, int, int, int, int, bool) {}
  virtual int GetItemWidthEx(void*) const { return 0; }

  enum MouseEventType { MT_LCLICKED, MT_RCLICKED, MT_DBCLICKED, MT_WHEEL_UP, MT_WHEEL_DOWN };
  enum MouseEventFlag { MF_TASKBAR_WND = 1 << 0 };
  virtual int OnMouseEvent(MouseEventType, int, int, void*, int) { return 0; }

  enum KeyboardEventFlag { KF_TASKBAR_WND = 1 << 0 };
  virtual int OnKeboardEvent(int, bool, bool, bool, void*, int) { return 0; }

  enum ItemInfoType {};
  virtual void* OnItemInfo(ItemInfoType, void*, void*) { return nullptr; }
  virtual int IsDrawResourceUsageGraph() const { return 0; }
  virtual float GetResourceUsageGraphValue() const { return 0.0F; }
};

class ITrafficMonitor;

class ITMPlugin {
 public:
  virtual int GetAPIVersion() const { return 7; }
  virtual IPluginItem* GetItem(int index) = 0;
  virtual void DataRequired() = 0;

  enum OptionReturn { OR_OPTION_CHANGED, OR_OPTION_UNCHANGED, OR_OPTION_NOT_PROVIDED };
  virtual OptionReturn ShowOptionsDialog(void*) { return OR_OPTION_NOT_PROVIDED; }

  enum PluginInfoIndex {
    TMI_NAME,
    TMI_DESCRIPTION,
    TMI_AUTHOR,
    TMI_COPYRIGHT,
    TMI_VERSION,
    TMI_URL,
    TMI_MAX
  };
  virtual const wchar_t* GetInfo(PluginInfoIndex index) = 0;

  struct MonitorInfo {
    unsigned long long up_speed{};
    unsigned long long down_speed{};
    int cpu_usage{};
    int memory_usage{};
    int gpu_usage{};
    int hdd_usage{};
    int cpu_temperature{};
    int gpu_temperature{};
    int hdd_temperature{};
    int main_board_temperature{};
    int cpu_freq{};
  };
  virtual void OnMonitorInfo(const MonitorInfo&) {}
  virtual const wchar_t* GetTooltipInfo() { return L""; }

  enum ExtendedInfoIndex {
    EI_LABEL_TEXT_COLOR,
    EI_VALUE_TEXT_COLOR,
    EI_DRAW_TASKBAR_WND,
    EI_NAIN_WND_NET_SPEED_SHORT_MODE,
    EI_MAIN_WND_SPERATE_WITH_SPACE,
    EI_MAIN_WND_UNIT_BYTE,
    EI_MAIN_WND_UNIT_SELECT,
    EI_MAIN_WND_NOT_SHOW_UNIT,
    EI_MAIN_WND_NOT_SHOW_PERCENT,
    EI_TASKBAR_WND_NET_SPEED_SHORT_MODE,
    EI_TASKBAR_WND_SPERATE_WITH_SPACE,
    EI_TASKBAR_WND_VALUE_RIGHT_ALIGN,
    EI_TASKBAR_WND_NET_SPEED_WIDTH,
    EI_TASKBAR_WND_UNIT_BYTE,
    EI_TASKBAR_WND_UNIT_SELECT,
    EI_TASKBAR_WND_NOT_SHOW_UNIT,
    EI_TASKBAR_WND_NOT_SHOW_PERCENT,
    EI_CONFIG_DIR
  };
  virtual void OnExtenedInfo(ExtendedInfoIndex, const wchar_t*) {}
  virtual void* GetPluginIcon() { return nullptr; }
  virtual int GetCommandCount() { return 0; }
  virtual const wchar_t* GetCommandName(int) { return nullptr; }
  virtual void* GetCommandIcon(int) { return nullptr; }
  virtual void OnPluginCommand(int, void*, void*) {}
  virtual int IsCommandChecked(int) { return 0; }
  virtual void OnInitialize(ITrafficMonitor*) {}
};
