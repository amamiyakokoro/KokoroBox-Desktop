import { addProfileItem, getCurrentProfileItem, getProfileConfig } from '../config'
import { profileUpdateDelay } from '../../shared/profile-update'

const intervalPool: Record<string, NodeJS.Timeout> = {}

export async function initProfileUpdater(): Promise<void> {
  const { items, current } = await getProfileConfig()
  const currentItem = await getCurrentProfileItem()
  for (const item of items.filter((i) => i.id !== current)) {
    if (item.type === 'remote' && item.interval && item.autoUpdate !== false) {
      const delay = profileUpdateDelay(item)

      if (delay === -1) {
        continue
      }

      if (delay === 0) {
        try {
          await addProfileItem(item)
        } catch (e) {
          // ignore
        }
      }

      if (intervalPool[item.id]) {
        clearTimeout(intervalPool[item.id])
      }

      intervalPool[item.id] = setTimeout(
        async () => {
          try {
            await addProfileItem(item)
          } catch (e) {
            // ignore
          }
        },
        delay === 0 ? item.interval * 60 * 1000 : delay
      )
    }
  }

  if (currentItem?.type === 'remote' && currentItem.interval && currentItem.autoUpdate !== false) {
    const delay = profileUpdateDelay(currentItem)

    if (delay === 0) {
      try {
        await addProfileItem(currentItem)
      } catch (e) {
        // ignore
      }
    }

    if (intervalPool[currentItem.id]) {
      clearTimeout(intervalPool[currentItem.id])
    }

    intervalPool[currentItem.id] = setTimeout(
      async () => {
        try {
          await addProfileItem(currentItem)
        } catch (e) {
          // ignore
        }
      },
      (delay === 0 ? currentItem.interval * 60 * 1000 : delay) + 10000 // +10s
    )
  }
}

export async function addProfileUpdater(item: ProfileItem): Promise<void> {
  if (item.type === 'remote' && item.interval && item.autoUpdate !== false) {
    if (intervalPool[item.id]) {
      clearTimeout(intervalPool[item.id])
    }

    const delay = profileUpdateDelay(item)

    if (delay === -1) {
      return
    }

    if (delay === 0) {
      try {
        await addProfileItem(item)
      } catch (e) {
        // ignore
      }
    }

    intervalPool[item.id] = setTimeout(
      async () => {
        try {
          await addProfileItem(item)
        } catch (e) {
          // ignore
        }
      },
      delay === 0 ? item.interval * 60 * 1000 : delay
    )
  }
}

export async function delProfileUpdater(id: string): Promise<void> {
  if (intervalPool[id]) {
    clearTimeout(intervalPool[id])
    delete intervalPool[id]
  }
}
