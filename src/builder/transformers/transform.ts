import { Bundle, StoreSpec, TransformData } from '../types'
import link from './link'
import resolveControllers from './resolveControllers'
import resolveFormulas from './resolveFormulas'
import resolveTables from './resolveTables'
import resolveOutputs from './resolveOutputs'
import resolveViews from './resolveViews'
import resolveRouters from './resolveRouters'

export default function transformBundle(bundle: Bundle) {
    const transformData: TransformData = {
        tables: {},
        roots: {},
        refs: {},
        routes: {},
        types: [],
        tableTypes: {},
        headers: {},
        channels: {},
        outputs: {},
        getEventHeader: () => {
            throw new Error('Can only call this after controllers have been resolved')
        },
        views: {
            bindings: [],
            events: [],
        },
        debugInfo: new WeakMap()
    }

    bundle = resolveTables(bundle)
    bundle = resolveRouters(bundle, transformData)
    bundle = resolveControllers(bundle, transformData)
    bundle = resolveViews(bundle, transformData)
    bundle = resolveOutputs(bundle, transformData)
    bundle = resolveFormulas(bundle, transformData)

    const store = link(bundle, transformData)

    return {
        store,
        views: transformData.views,
        routes: transformData.routes,
        headers: transformData.headers,
        channels: transformData.channels
    }
}
