import * as yup from "yup";

export type LoginForm = {
  email: string;
  password: string;
};

export type RegisterForm = {
  username: string;
  email: string;
  password: string;
};

export type ForgotPasswordForm = {
  email: string;
};

export type ResetPasswordForm = {
  password: string;
  confirmPassword: string;
};

export const forgotPasswordSchema: yup.ObjectSchema<ForgotPasswordForm> = yup.object({
  email: yup.string().email("Email inválido").required("O email é obrigatório"),
});

export const resetPasswordSchema: yup.ObjectSchema<ResetPasswordForm> = yup.object({
  password: yup.string().min(6, "Mínimo de 6 caracteres").required("A senha é obrigatória"),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref("password")], "As senhas não coincidem")
    .required("Confirme a senha"),
});

export const loginSchema: yup.ObjectSchema<LoginForm> = yup.object({
  email: yup.string().email("Email inválido").required("O email é obrigatório"),
  password: yup.string().required("A senha é obrigatória"),
});

export const registerSchema: yup.ObjectSchema<RegisterForm> = yup.object({
  username: yup.string().required("O nome é obrigatório"),
  email: yup.string().email("Email inválido").required("O email é obrigatório"),
  password: yup.string().min(6, "Mínimo de 6 caracteres").required("A senha é obrigatória"),
});
