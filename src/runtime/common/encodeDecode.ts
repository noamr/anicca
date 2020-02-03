import { NativeType } from '../../builder/types'
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function encodeString(str: string): [number, (buffer: ArrayBuffer, offset: number) => void] {
    const textBuffer = textEncoder.encode(str)
    return [textBuffer.length + 4, (buffer, offset) => {
        const view = new DataView(buffer)
        view.setUint32(offset, textBuffer.length)
        new Uint8Array(buffer).set(textBuffer, offset + 4)
    }]
}

function decodeString(buffer: ArrayBuffer, offset: number): string {
    const length = new DataView(buffer).getUint32(offset)
    const stringView = new DataView(buffer, offset + 4, length)
    return textDecoder.decode(stringView)
}

function getNumberEncoder(f: (n: number, offset: number) => void, byteLength: number) {
    return (n: number) => [byteLength, (buffer: ArrayBuffer, offset: number) =>
        f.call(new DataView(buffer), offset, n)] as
            [number, (buffer: ArrayBuffer, offset: number) => void]
}

const encoders = {
    string: encodeString,
    bool: getNumberEncoder(DataView.prototype.setUint8, 1),
    u8: getNumberEncoder(DataView.prototype.setUint8, 1),
    i8: getNumberEncoder(DataView.prototype.setInt8, 1),
    u16: getNumberEncoder(DataView.prototype.setUint16, 2),
    i16: getNumberEncoder(DataView.prototype.setInt16, 2),
    u32: getNumberEncoder(DataView.prototype.setUint32, 4),
    i32: getNumberEncoder(DataView.prototype.setInt32, 4),
    f32: getNumberEncoder(DataView.prototype.setFloat32, 4),
    f64: getNumberEncoder(DataView.prototype.setFloat64, 8),
    u64: getNumberEncoder(DataView.prototype.setFloat64, 8),
    i64: getNumberEncoder(DataView.prototype.setFloat64, 8),
} as {[key: string]: any}

export function encodeTuple(values: Array<string | number>, types: NativeType[]): ArrayBuffer {
    const enc = types.map((t, i) => encoders[t as string](values[i]))
    const length = enc.reduce((a, s) => a + s[0], 0)
    const buffer = new ArrayBuffer(length)
    let offset = 0
    for (const [size, encode] of enc) {
        encode(buffer, offset)
        offset += size
    }

    return buffer
}

export function decodeBindings(buffer: ArrayBuffer,
                               emit: (binding: number, key: number, value: string) => void)
{
    const dv = new DataView(buffer)
    const num = dv.getUint32(0)
    let offset = 4
    for (let i = 0; i < num; ++i) {
        const binding = dv.getUint32(offset)
        const numValues = dv.getUint32(offset + 4)
        offset += 8
        for (let j = 0; j < numValues; ++j) {
            const key = dv.getUint32(offset)
            const strLength = dv.getUint32(offset + 4)
            const stringView = new DataView(dv.buffer, offset + 8, strLength)
            const value = textDecoder.decode(stringView)
            offset += 8 + strLength
            emit(binding, key, value)
        }
    }
}

export function encodeBindings(bindings: Map<number, Map<number, string>>): ArrayBuffer {
    const numBindings = bindings.size
    const encoded =
        Array.from(bindings.entries()).map(([binding, values]) =>
            [binding, Array.from(values.entries()).map(([key, value]) =>
                [key, textEncoder.encode(value)] as [number, Uint8Array])] as [number, Array<[number, Uint8Array]>])
    const totalStringLength = encoded.reduce((a, [key, values]) => values.reduce((b, v) => b + v[1].byteLength, a), 0)
    const totalValues = encoded.reduce((a, [key, values]) => values.length, 0)
    const buffer = new ArrayBuffer(totalStringLength + totalValues * 4 + encoded.length * 4 + 4)
    const asUint8 = new Uint8Array(buffer)
    const dataView = new DataView(buffer)
    let offset = 4
    dataView.setUint32(0, encoded.length)
    encoded.forEach(([bindingIndex, values]) => {
        dataView.setUint32(offset, bindingIndex)
        dataView.setUint32(offset + 4, values.length)
        offset += 8
        for (const [key, value] of values) {
            dataView.setUint32(offset, key)
            dataView.setUint32(offset, value.byteLength + 4)
            asUint8.set(value, offset + 8)
            offset += value.byteLength + 8
        }
    })

    return buffer
}