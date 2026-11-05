import { ref } from 'vue'
import { getPrivateAccess, setPrivateAccess } from '../api/sdrManagerLocalApi'
import { useLocalSdrStore } from '../stores/localSdrStore'
import { privateAccessErrorMessage } from '../utils/errorMessages'

/**
 * `usePrivateAccess` — the addresses allowed to use this machine's private
 * dongles: loading them, and adding or removing one. Each change saves the
 * whole list at once, so what is shown is always what the host enforces.
 */
export function usePrivateAccess() {
  const store = useLocalSdrStore()
  const addresses = ref<string[]>([])
  const saving = ref(false)
  const errorMessage = ref<string | null>(null)

  async function load(): Promise<void> {
    try {
      addresses.value = (await getPrivateAccess()).addresses
      errorMessage.value = null
    } catch (error) {
      errorMessage.value = privateAccessErrorMessage(error, 'The address list could not be loaded.')
    }
  }

  async function save(nextAddresses: string[], announcement: string): Promise<boolean> {
    saving.value = true
    errorMessage.value = null
    try {
      addresses.value = (await setPrivateAccess(nextAddresses)).addresses
      store.announce(announcement)
      return true
    } catch (error) {
      errorMessage.value = privateAccessErrorMessage(error, 'The address list could not be saved.')
      return false
    } finally {
      saving.value = false
    }
  }

  function add(address: string): Promise<boolean> {
    return save([...addresses.value, address], `${address} added.`)
  }

  function remove(address: string): Promise<boolean> {
    return save(
      addresses.value.filter((listed) => listed !== address),
      `${address} removed.`,
    )
  }

  return { addresses, saving, errorMessage, load, add, remove }
}
