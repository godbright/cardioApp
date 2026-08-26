// Allows `import samples from './signal.raw'` in TypeScript.
// The Metro rawTransformer converts each .raw file (ASCII CSV of ADC integers)
// into a peak-normalized float array at bundle time.
declare module '*.raw' {
  const samples: number[];
  export default samples;
}
