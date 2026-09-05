import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'
import { getLocale } from '../../../shared/i18n'

document.documentElement.lang = getLocale()
dayjs.locale(getLocale().toLowerCase())
