import { tr } from '../../../../shared/i18n'

export function getOutboundModeLabel(mode: OutboundMode): string {
  switch (mode) {
    case 'global':
      return tr('Global')
    case 'direct':
      return tr('Direct')
    case 'rule':
      return tr('Rules')
  }
}
