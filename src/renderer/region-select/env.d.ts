import type { RegionSelectApi } from '../../preload/region-select'

declare global {
  interface Window {
    regionApi: RegionSelectApi
  }
}
