import { Bundle, StoreSpec, TransformData } from '../types'
import link from './link'
import resolveControllers from './resolveControllers'
import resolveFormulas from './resolveFormulas'
import resolveTables from './resolveTables'
import resolveOutputs from './resolveOutputs'
import resolveViews from './resolveViews'
import resolveRouters from './resolveRouters'
import resolvePersist from './resolvePersist'

export default function transformBundle(bundle: Bundle) {
    const transformData: TransformData = {
        tables: {},
        roots: {},
        refs: {},
        routes: {},
        persist: [],
        types: [],
        tableTypes: {},
        headers: {},
        channels: {},
        onCommit: [],
        outputs: {},
        enums: {},
        getTableType: () => {
            throw new Error('Can only call this after tables have been resolved')
        },
        resolveNamedTypes: () => {
            throw new Error('Can only call this after tables have been resolved')
        },
        getEventHeader: () => {
            throw new Error('Can only call this after controllers have been resolved')
        },
        getEventPayloadType: () => {
            throw new Error('Can only call this after controllers have been resolved')
        },
        views: {
            types: [],
            bindings: [],
            formulas: [],
            events: [],
        },
        debugInfo: new WeakMap()
    }

    bundle = resolveTables(bundle, transformData)
    bundle = resolveRouters(bundle, transformData)
    bundle = resolvePersist(bundle, transformData)
    bundle = resolveControllers(bundle, transformData)
    bundle = resolveViews(bundle, transformData)
    bundle = resolveOutputs(bundle, transformData)
    bundle = resolveFormulas(bundle, transformData)

    const store = link(bundle, transformData)

    return {
        store,
        persist: transformData.persist,
        views: transformData.views,
        routes: transformData.routes,
        headers: transformData.headers,
        channels: transformData.channels
    }
}
