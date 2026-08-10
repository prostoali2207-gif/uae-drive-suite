import { PDFDocument, PDFImage } from "pdf-lib";

type PackagePart = {
  blob: Blob;
  firstPageOnly?: boolean;
};

type BuildBlackPointPackageInput = {
  formPdf: Blob;
  contractPdf: Blob;
  passport?: Blob | null;
  licenseFront?: Blob | null;
  licenseBack?: Blob | null;
  mulkiya: Blob;
  fineScreenshot: Blob;
  companyLicense: Blob;
  stampPng?: Uint8Array;
};

const A4 = { width: 595.28, height: 841.89 };
const STAMP_MAX_WIDTH = 128;
const STAMP_MAX_HEIGHT = 72;

const toPngBlob = async (blob: Blob): Promise<Blob> => {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare image document");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare image document")), "image/png");
  });
};

const addImagePage = async (target: PDFDocument, blob: Blob) => {
  const normalized = blob.type === "image/jpeg" || blob.type === "image/jpg" ? blob : await toPngBlob(blob);
  const bytes = new Uint8Array(await normalized.arrayBuffer());
  let image: PDFImage;
  if (normalized.type === "image/jpeg" || normalized.type === "image/jpg") image = await target.embedJpg(bytes);
  else image = await target.embedPng(bytes);

  const page = target.addPage([A4.width, A4.height]);
  const margin = 28;
  const maxWidth = A4.width - margin * 2;
  const maxHeight = A4.height - margin * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (A4.width - width) / 2,
    y: (A4.height - height) / 2,
    width,
    height,
  });
};

const appendPart = async (target: PDFDocument, part: PackagePart) => {
  if (part.blob.type === "application/pdf") {
    const source = await PDFDocument.load(await part.blob.arrayBuffer());
    const indexes = part.firstPageOnly ? [0] : source.getPageIndices();
    const pages = await target.copyPages(source, indexes);
    pages.forEach((page) => target.addPage(page));
    return;
  }
  if (part.blob.type.startsWith("image/")) {
    await addImagePage(target, part.blob);
    return;
  }
  throw new Error(`Unsupported document type: ${part.blob.type || "unknown"}`);
};

const stampPages = async (target: PDFDocument, stampPng?: Uint8Array, skipFirstPages = 0) => {
  if (!stampPng?.length) return;
  const image = await target.embedPng(stampPng);
  const natural = image.scale(1);
  const scale = Math.min(STAMP_MAX_WIDTH / natural.width, STAMP_MAX_HEIGHT / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;

  for (const [index, page] of target.getPages().entries()) {
    if (index < skipFirstPages) continue;
    const { width: pageWidth } = page.getSize();
    page.drawImage(image, {
      x: pageWidth - width - 28,
      y: 28,
      width,
      height,
    });
  }
};

export const buildBlackPointSubmissionPackage = async ({
  formPdf,
  contractPdf,
  passport,
  licenseFront,
  licenseBack,
  mulkiya,
  fineScreenshot,
  companyLicense,
  stampPng,
}: BuildBlackPointPackageInput): Promise<Blob> => {
  const target = await PDFDocument.create();

  // Required authority order:
  // form -> contract -> passport -> driving licence -> Mulkiya -> fine screenshot -> company Trade License.
  // The form already receives its stamp while being filled, so package stamping starts after it.
  await appendPart(target, { blob: formPdf });
  const formPageCount = target.getPageCount();
  await appendPart(target, { blob: contractPdf, firstPageOnly: true });
  if (passport) await appendPart(target, { blob: passport });
  if (licenseFront) await appendPart(target, { blob: licenseFront });
  if (licenseBack) await appendPart(target, { blob: licenseBack });
  await appendPart(target, { blob: mulkiya });
  await appendPart(target, { blob: fineScreenshot });
  await appendPart(target, { blob: companyLicense });
  await stampPages(target, stampPng, formPageCount);

  const bytes = await target.save();
  return new Blob([bytes], { type: "application/pdf" });
};
