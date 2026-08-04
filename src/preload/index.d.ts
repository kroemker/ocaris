import type { OcarisApi } from './index'

declare global {
  interface Window {
    api: OcarisApi
  }
}
