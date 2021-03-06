import createShell from '../common/Shell'
import { StoreSpec } from '../../builder/types'
import createStoreInterpreter from './StoreInterpreter'
import { StartMessage } from '../common/RuntimeTypes'

export default function initInterpreterWorker(spec: StoreSpec) {
    const store = createStoreInterpreter(spec)
    self.onmessage = ev => {
        if (ev.data.type === 'start') {
            const {ports} = ev.data.payload as StartMessage
            createShell({ports, store})
        }
    }
}
