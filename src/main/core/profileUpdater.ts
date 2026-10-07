import { addProfileItem, getProfileConfig, getProfileItem } from '../config'
import { appendAppLog } from '../utils/log'
import { createProfileUpdateScheduler } from './profile-update-scheduler'

const scheduler = createProfileUpdateScheduler({
  getItem: getProfileItem,
  refresh: addProfileItem,
  onError: (id, error) => {
    void appendAppLog(`[Profile updater]: refresh failed for ${id}, ${error}\n`).catch(() => {})
  }
})

export async function initProfileUpdater(): Promise<void> {
  scheduler.clear()
  const { items } = await getProfileConfig()
  for (const item of items) scheduler.upsert(item)
}

export async function addProfileUpdater(item: ProfileItem): Promise<void> {
  scheduler.upsert(item)
}

export async function delProfileUpdater(id: string): Promise<void> {
  scheduler.remove(id)
}
