import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  LoginForm,
  RegisterForm,
  ForgotPasswordForm,
  ResetPasswordForm,
} from "../validation/auth";

export function useLoginForm() {
  return useForm<LoginForm>({
    defaultValues: { email: "", password: "" },
    resolver: yupResolver(loginSchema),
  });
}

export function useRegisterForm() {
  return useForm<RegisterForm>({
    defaultValues: { username: "", email: "", password: "" },
    resolver: yupResolver(registerSchema),
  });
}

export function useForgotPasswordForm() {
  return useForm<ForgotPasswordForm>({
    defaultValues: { email: "" },
    resolver: yupResolver(forgotPasswordSchema),
  });
}

export function useResetPasswordForm() {
  return useForm<ResetPasswordForm>({
    defaultValues: { password: "", confirmPassword: "" },
    resolver: yupResolver(resetPasswordSchema),
  });
}
