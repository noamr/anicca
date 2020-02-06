import {encode, decode} from './transport'

export default function initPersist(header: number, stores: string[]) {

    function persist({port, dbName}: {port: MessagePort, dbName: string}) {
        const dbStart = indexedDB.open(dbName, 1)

        dbStart.addEventListener('error', e => {
            console.error(e)
            // TODO: send error to controller
        })

        function initDB(db: IDBDatabase) {
            stores.forEach(t => db.createObjectStore(t))
        }

        function sendTable(index: number, data: Map<number, ArrayBuffer>) {
            const payload = encode([index, data], {tuple: ['u32', {dictionary: ['u32', 'ByteArray']}]})
            port.postMessage({header, payload}, [payload])
        }

        function onDBLoaded(db: IDBDatabase) {
            const transaction = db.transaction(stores, 'readonly')
            const persistedData = stores.map(() => new Map<number, ArrayBuffer>())
            stores.forEach((name, i) => {
                const request = transaction.objectStore(name).openCursor()
                request.addEventListener('success', e => {
                    const cursor = request.result as IDBCursorWithValue
                    if (cursor) {
                        persistedData[i].set(cursor.key as number, cursor.value as ArrayBuffer)
                        cursor.continue()
                    } else {
                        sendTable(i, persistedData[i])
                    }
                })
            })

            port.addEventListener('message', (e) => {
                const {payload}: {payload: ArrayBuffer} = e.data
                const decoded = decode(payload,
                    {dictionary: ['u32', {dictionary: ['u32', 'ByteArray']}]}) as
                        Map<number, Map<number, ArrayBuffer>> | null
                if (!decoded)
                    return

                const transaction = db.transaction([...decoded.keys()].map(i => stores[i]), 'readwrite')

                for (const [storeIndex, entries] of decoded) {
                    const store = transaction.objectStore(stores[storeIndex])
                    for (const [id, buffer] of entries)
                        if (buffer.byteLength)
                            store.put(buffer, id)
                        else
                            store.delete(id)
                }
            })

            port.start()
        }

        dbStart.addEventListener('upgradeneeded', e => initDB(dbStart.result as IDBDatabase))
        dbStart.addEventListener('success', e => onDBLoaded(dbStart.result as IDBDatabase))
    }

    self.onmessage = ({data}) => {
        if (data.type === 'start') {
            const {port, dbName} = data.payload as {port: MessagePort, dbName: string}
            persist({port, dbName})
        }
    }
}
