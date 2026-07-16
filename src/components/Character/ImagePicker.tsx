"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Box, Stack, Typography, Skeleton, Tooltip, Button, CircularProgress } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import UploadIcon from "@mui/icons-material/Upload";
import { toast } from "react-toastify";
import api from "../../lib/api";
import { characterImageSrc } from "../../lib/characterImage";

type Props = {
  value: string;
  onChange: (filename: string) => void;
};

/**
 * Grid de seleção de imagens. Visível apenas para o admin.
 * Lista imagens locais (public/characters/) e do Cloudinary (pasta prisma-rpg)
 * via /api/admin/images, e permite subir novas direto pra pasta do Cloudinary.
 */
export function ImagePicker({ value, onChange }: Props) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadImages() {
    try {
      const res = await api.get("/admin/images", { silent: true });
      setImages(res.data.images ?? []);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadImages();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await api.post("/admin/images", { dataUri, filename: file.name });
      toast.success("Imagem enviada");
      await loadImages();
      if (res.data?.image) onChange(res.data.image); // já seleciona a nova imagem
    } catch {
      // erro já exibido pelo interceptor da api
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return <Skeleton variant="rounded" height={120} />;
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="caption" color="text.secondary">
          Escolha uma imagem da biblioteca (admin)
        </Typography>
        <Button
          size="small"
          startIcon={uploading ? <CircularProgress size={14} /> : <UploadIcon />}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          Enviar imagem
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </Stack>
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {/* Opção "sem imagem" */}
        <Tooltip title="Sem imagem">
          <Box
            onClick={() => onChange("")}
            sx={{
              width: 64, height: 64,
              borderRadius: 1,
              border: !value ? "2px solid #8B9DFF" : "2px solid transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.04)",
              cursor: "pointer",
              position: "relative",
              "&:hover": { background: "rgba(255,255,255,0.08)" },
            }}
          >
            <BlockIcon sx={{ color: "#666" }} />
            {!value && (
              <CheckCircleIcon sx={{
                position: "absolute", top: -6, right: -6, fontSize: 18,
                color: "#8B9DFF", background: "#12121e", borderRadius: "50%",
              }} />
            )}
          </Box>
        </Tooltip>

        {images.map((filename) => {
          const isSelected = value === filename;
          return (
            <Tooltip key={filename} title={filename.split("/").pop()}>
              <Box
                onClick={() => onChange(filename)}
                sx={{
                  width: 64, height: 64,
                  borderRadius: 1,
                  border: isSelected ? "2px solid #8B9DFF" : "2px solid transparent",
                  position: "relative",
                  cursor: "pointer",
                  overflow: "hidden",
                  "&:hover": { transform: "scale(1.05)" },
                  transition: "transform 0.15s",
                }}
              >
                <Avatar
                  src={characterImageSrc(filename)}
                  variant="rounded"
                  sx={{ width: "100%", height: "100%" }}
                />
                {isSelected && (
                  <CheckCircleIcon sx={{
                    position: "absolute", top: -6, right: -6, fontSize: 18,
                    color: "#8B9DFF", background: "#12121e", borderRadius: "50%",
                  }} />
                )}
              </Box>
            </Tooltip>
          );
        })}

        {images.length === 0 && (
          <Typography variant="caption" color="text.disabled">
            Nenhuma imagem disponível. Use &quot;Enviar imagem&quot; acima.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
