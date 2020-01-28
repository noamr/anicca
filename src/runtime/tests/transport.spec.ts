import { decode, encode } from '../interpreter/transport'
import { NativeType } from '../../builder/types'

const testEncodeDecode = (value: any, type: NativeType, fuzz: number|null = null) => it(JSON.stringify({value, type}), () => {
    const encoded = encode(value, type)
    expect(new Uint8Array(encoded).toString()).toMatchSnapshot()
    const decoded = decode(encoded, type)
    if (fuzz)
        expect(decoded).toBeCloseTo(value)
    else 
        expect(decoded).toEqual(value)
})
describe('transports', () => {
    testEncodeDecode(8, 'u8')
    testEncodeDecode(800, 'u16')
    testEncodeDecode(-8, 'i8')
    testEncodeDecode(-2342, 'i16')
    testEncodeDecode(0xFF34, 'u32')
    testEncodeDecode(-800000000, 'i32')
    testEncodeDecode(0xFF34FF, 'u64')
    testEncodeDecode(-8000000000000, 'i64')
    testEncodeDecode(1238.0333, 'f32', .003)
    testEncodeDecode(12383242.03333, 'f64')
    testEncodeDecode('hello world', 'string')
    testEncodeDecode('', 'string')
    testEncodeDecode(['abc', 123, 'def'], {tuple: ['string', 'u8', 'string']})
    testEncodeDecode(['abc', 123, [456, ['def']]], {tuple: ['string', 'u8', {tuple: ['u64', {tuple: ['string']}]}]})
    testEncodeDecode(new Map([[0, 'a'], [123, 'bla bla']]), {dictionary: ['u16', 'string']})
    testEncodeDecode(new Map([[0, ['a', new Map([[true, ['yes']]])]], [123, ['bla bla', new Map([[true, ['ok']], [false, ['not ok']]])]]]), 
                    {dictionary: ['f32', {tuple: ['string', {dictionary: ['bool', {tuple: ['string']}]}]}]})
    testEncodeDecode(true, 'bool')
})
