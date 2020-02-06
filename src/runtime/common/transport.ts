import { NativeType, NativeDictionaryType, NativeTupleType } from '../../builder/types'

function encodeNumber(value: number, f: keyof DataView, size: number): ArrayBuffer[] {
    const dv = new DataView(new ArrayBuffer(size));
    (dv[f] as ((a: number, b: number) => void))(0, value)
    return [dv.buffer]
}
function encodeSingle(value: any, type: NativeType): ArrayBuffer[] {
    switch (type) {
        case 'null':
            return []
        case 'u32':
            return encodeNumber(value, 'setUint32', 4)
        case 'i32':
            return encodeNumber(value, 'setInt32', 4)
        case 'u16':
            return encodeNumber(value, 'setUint16', 2)
        case 'i16':
            return encodeNumber(value, 'setInt16', 2)
        case 'u8':
            return encodeNumber(value, 'setUint8', 1)
        case 'i8':
            return encodeNumber(value, 'setInt8', 1)
        case 'f32':
            return encodeNumber(value, 'setFloat32', 4)
        case 'f64':
        case 'u64':
        case 'i64':
            return encodeNumber(value, 'setFloat64', 8)
        case 'bool':
            return encodeNumber(value ? 1 : 0, 'setUint8', 1)
        case 'string': {
            const {buffer} = new TextEncoder().encode(value as string)
            return [...encodeSingle(buffer.byteLength, 'u32'), buffer as ArrayBuffer]
        }
        case 'ByteArray': {
            if (typeof value !== 'object' || !(value instanceof ArrayBuffer))
                throw new Error(`Expecting ArrayBuffer when encoding ${value}`)
            return [...encodeSingle((value as ArrayBuffer).byteLength, 'u32'), value as ArrayBuffer]
        }
        default:
            throw new Error(`Unknown native type: ${type}`)
    }
}

function decodeSingle(view: DataView, type: NativeType): [any, DataView] {
    switch (type) {
        case 'u32':
            return [view.getUint32(0), new DataView(view.buffer, view.byteOffset + 4)]
        case 'i32':
            return [view.getInt32(0), new DataView(view.buffer, view.byteOffset + 4)]
        case 'u16':
            return [view.getUint16(0), new DataView(view.buffer, view.byteOffset + 2)]
        case 'i16':
            return [view.getInt16(0), new DataView(view.buffer, view.byteOffset + 2)]
        case 'u8':
            return [view.getUint8(0), new DataView(view.buffer, view.byteOffset + 1)]
        case 'i8':
            return [view.getInt8(0), new DataView(view.buffer, view.byteOffset + 1)]
        case 'f32':
            return [view.getFloat32(0), new DataView(view.buffer, view.byteOffset + 4)]
        case 'u64':
        case 'i64':
        case 'f64':
            return [view.getFloat64(0), new DataView(view.buffer, view.byteOffset + 8)]
        case 'bool':
            return [!!view.getUint8(0), new DataView(view.buffer, view.byteOffset + 1)]
        case 'string': {
            const length = view.getUint32(0)
            return [new TextDecoder().decode(new DataView(view.buffer, view.byteOffset + 4, length)),
                    new DataView(view.buffer, view.byteOffset + 4 + length)]
        }
        case 'ByteArray': {
            const size = view.getUint32(0)
            return [view.buffer.slice(view.byteOffset + 4, view.byteOffset + 4 + size),
                new DataView(view.buffer, view.byteOffset + 4 + size)]
        }
        default:
            throw new Error(`Unknown native type: ${type}`)
    }
}

function decodeAny(buffer: DataView, type: NativeType): [any, DataView] {
    if (type === 'null')
        return [null, new DataView(new ArrayBuffer(0))]
    if (typeof type === 'string')
        return decodeSingle(buffer, type)

    if (Reflect.has(type, 'dictionary')) {
        const {dictionary} = type as NativeDictionaryType
        return decodeDictionary(buffer, dictionary[0], dictionary[1])
    }

    if (Reflect.has(type, 'tuple')) {
        const {tuple} = type as NativeTupleType<any>
        return decodeTuple(buffer, tuple)
    }

    throw new Error(`Unknown type: ${type}`)
}

function decodeDictionary(view: DataView, keyType: NativeType, valueType: NativeType): [Map<any, any>, DataView] {
    const size = view.getUint32(0)
    view = new DataView(view.buffer, view.byteOffset + 4)
    const entries = Array(size).fill(null).map((n, i) => {
        const keyResult = decodeAny(view, keyType)
        view = keyResult[1]
        const valueResult = decodeAny(view, valueType)
        view = valueResult[1]
        return [keyResult[0], valueResult[0]]
    }) as [[any, any]]

    return [new Map(entries), view]
}

function decodeTuple(view: DataView, types: NativeType[]): [any[], DataView] {
    const results = new Array(types.length).fill(null).map((n, i) => {
        const result = decodeAny(view, types[i])
        view = result[1]
        return result[0]
    }) as any[]

    return [results, view]
}

function encodeDictionary(value: Map<any, any>, keyType: NativeType, valueType: NativeType): ArrayBuffer[] {
    return [
        ...encodeAny(value.size, 'u32'),
        ...[...value.entries()].flatMap(([key, value]) => [...encodeAny(key, keyType), ...encodeAny(value, valueType)])
    ]
}

function encodeAny(value: any, type: NativeType): ArrayBuffer[] {
    if (typeof type === 'string')
        return encodeSingle(value, type)

    if (Reflect.has(type, 'dictionary')) {
        const [keyType, valueType] = (type as NativeDictionaryType).dictionary
        if (typeof value !== 'object') {
            throw new Error(`Expecting object when encoding ${value}`)
        }

        if (!(value instanceof Map)) {
            throw new Error(`Expecting map when encoding ${value}`)
        }

        return encodeDictionary(value as Map<any, any>, keyType, valueType)
    }

    if (Reflect.has(type, 'tuple')) {
        const tt = type as NativeTupleType<any>

        if (!Array.isArray(value))
            throw new Error(`Expecting array when encoing ${value}`)
        const a = value as any[]
        if (a.length !== tt.tuple.length)
            throw new Error(`Tuple length of ${value} is ${value.length}, expected ${tt.tuple.length}`)

        return a.flatMap((v, i) => encodeAny(v, tt.tuple[i]))
    }

    throw new Error(`Unknown value: ${value}`)
}

export function encode(value: any, type: NativeType): ArrayBuffer {
    const buffers = encodeAny(value, type)
    const result = new ArrayBuffer(buffers.reduce((a, b) => a + b.byteLength, 0))
    const u8 = new Uint8Array(result)
    let offset = 0
    buffers.forEach(b => {
        u8.set(new Uint8Array(b), offset)
        offset += b.byteLength
    })

    return result
}

export function decode(buffer: ArrayBuffer, type: NativeType): any {
    return buffer ? decodeAny(new DataView(buffer), type)[0] : null
}