import { z } from "zod";
import {
  CandidateFieldKeySchema,
  PageClassificationSchema,
  RowTypeSchema,
} from "@/types/domain";

export const GeminiBboxSchema = z
  .object({
    ymin: z.number().min(0).max(1000),
    xmin: z.number().min(0).max(1000),
    ymax: z.number().min(0).max(1000),
    xmax: z.number().min(0).max(1000),
  })
  .nullable();

export const GeminiCandidateItemSchema = z.object({
  fieldKey: CandidateFieldKeySchema,
  rawText: z.string(),
  rawValue: z.string(),
  normalizedValue: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable(),
  buildingLabel: z.string().nullable(),
  floorLabel: z.string().nullable(),
  usageLabel: z.string().nullable(),
  structureLabel: z.string().nullable(),
  areaCategoryLabel: z.string().nullable(),
  rowType: RowTypeSchema.default("detail"),
  bbox1000: GeminiBboxSchema,
  confidence: z.number().min(0).max(1).nullable(),
});

export const GeminiPageAnalysisResponseSchema = z.object({
  pageClassification: PageClassificationSchema,
  statedScaleText: z.string().nullable(),
  candidates: z.array(GeminiCandidateItemSchema),
});

export type GeminiPageAnalysisResponse = z.infer<
  typeof GeminiPageAnalysisResponseSchema
>;

export const AnalyzePageRequestSchema = z.object({
  projectId: z.string().min(1),
  documentId: z.string().min(1),
  documentVersion: z.number().int().positive(),
  documentHash: z.string().min(8),
  runId: z.string().min(1),
  pageIndex: z.number().int().min(1).max(30),
  imageBase64: z.string().max(4_500_000), // 최대 약 3MB 이미지
  imageMimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  extractedTextItems: z
    .array(
      z.object({
        str: z.string().max(500),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
    )
    .max(2500),
  transformMeta: z.object({
    originalPageWidthPt: z.number().positive(),
    originalPageHeightPt: z.number().positive(),
    pdfNativeRotation: z.number(),
    renderRotation: z.number(),
    imageWidthPx: z.number().positive(),
    imageHeightPx: z.number().positive(),
    cropBoxPt: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
  }),
});

export type AnalyzePageRequest = z.infer<typeof AnalyzePageRequestSchema>;
