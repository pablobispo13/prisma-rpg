import * as yup from "yup";
import { validateFormula } from "../lib/formula";

export type CampaignForm = {
  name: string;
  description?: string | null;
  defenseFormula?: string | null;
  maxLifeFormula?: string | null;
};

const formulaField = yup
  .string()
  .trim()
  .max(120, "Máximo 120 caracteres")
  .optional()
  .nullable()
  .transform((v) => (v === "" ? null : v))
  .test("formula", function (value) {
    if (value == null) return true;
    const error = validateFormula(value);
    return error ? this.createError({ message: error }) : true;
  });

export const campaignSchema: yup.ObjectSchema<CampaignForm> = yup.object({
  name: yup
    .string()
    .trim()
    .required("O nome da mesa é obrigatório")
    .min(2, "Nome muito curto")
    .max(60, "Máximo 60 caracteres"),
  description: yup
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres")
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v)),
  defenseFormula: formulaField,
  maxLifeFormula: formulaField,
});

export type JoinForm = {
  code: string;
};

export const joinSchema: yup.ObjectSchema<JoinForm> = yup.object({
  code: yup
    .string()
    .trim()
    .uppercase()
    .required("Código obrigatório")
    .length(6, "Código deve ter 6 caracteres"),
});
