import { Bundle, StoreSpec, TransformData } from '../types'
import link from './link'
import resolveControllers from './resolveControllers'
import resolveFormulas from './resolveFormulas'
import resolveTables from './resolveFormulas'
import resolveOutputs from './resolveOutputs'
import resolveViews from './resolveViews'

export default function transformBundle(bundle: Bundle): StoreSpec {
    const transformData: TransformData = {
        tables: {},
        roots: {},
        refs: {},
        outputNames: {},
        outputs: {},
        getEventHeader: () => {
            throw new Error('Can only call this after controllers have been resolved')
        },
        views: {
            bindings: [],
            events: [],
        },
    }

    bundle = resolveTables(bundle, transformData)
    bundle = resolveControllers(bundle, transformData)
    bundle = resolveViews(bundle, transformData)
    bundle = resolveOutputs(bundle, transformData)
    bundle = resolveFormulas(bundle, transformData)
    return link(bundle, transformData)
}
