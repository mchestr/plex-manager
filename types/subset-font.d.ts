/** The part of `subset-font` (no bundled types) that the card safe mode uses. */
declare module "subset-font" {
  interface SubsetOptions {
    targetFormat?: "sfnt" | "truetype" | "woff" | "woff2"
  }
  export default function subsetFont(font: Buffer, text: string, options?: SubsetOptions): Promise<Buffer>
}
