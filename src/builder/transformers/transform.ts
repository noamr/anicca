import { Bundle, StoreSpec, TransformData } from '../types'
import link from './link'
import resolveControllers from './resolveControllers'
import resolveFormulas from './resolveFormulas'
import resolveTables from './resolveTables'
import resolveOutputs from './resolveOutputs'
import resolveViews from './resolveViews'

export default function transformBundle(bundle: Bundle) {
    const transformData: TransformData = {
        tables: {},
        roots: {},
        refs: {},
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
    bundle = resolveControllers(bundle, transformData)
    bundle = resolveViews(bundle, transformData)
    bundle = resolveOutputs(bundle, transformData)
    bundle = resolveFormulas(bundle, transformData)
    return {
        store: link(bundle, transformData),
        views: transformData.views,
        channels: transformData.channels
    }
}
