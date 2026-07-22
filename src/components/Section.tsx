import { useEffect, useState } from "react";
import { Box, Typography, Stack, Divider, IconButton, Collapse } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

type Props = {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  // Quando true, mostra um chevron pra recolher/expandir o conteúdo da seção
  collapsible?: boolean;
  // Se informado, o estado aberto/fechado persiste no localStorage sob essa chave
  storageKey?: string;
  defaultOpen?: boolean;
};

export function Section({
  title,
  children,
  action,
  collapsible = false,
  storageKey,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!collapsible || !storageKey) return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) setOpen(stored === "1");
  }, [collapsible, storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) window.localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  };

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          mb: 2.5,
          pb: 1.5,
          position: "relative",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          flex={1}
          onClick={collapsible ? toggle : undefined}
          sx={{ cursor: collapsible ? "pointer" : "default" }}
        >
          <Box
            sx={{
              width: 4,
              height: 24,
              backgroundColor: "rgba(107, 122, 219, 0.6)",
              borderRadius: 2,
              transition: "all 0.3s ease",
            }}
          />
          <Typography
            variant="h6"
            sx={{
              fontWeight: "bold",
              background: "linear-gradient(135deg, #6B7ADB, #8B9DFF)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "0.5px",
            }}
          >
            {title}
          </Typography>
          {collapsible && (
            <IconButton size="small" sx={{ p: 0.25 }}>
              <ExpandMoreIcon
                sx={{
                  fontSize: "1.2rem",
                  color: "#8B9DFF",
                  transform: open ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s",
                }}
              />
            </IconButton>
          )}
        </Stack>
        {action && (
          <Box onClick={(e) => e.stopPropagation()}>{action}</Box>
        )}
        <Divider
          sx={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            borderColor: "rgba(107, 122, 219, 0.2)",
            transition: "all 0.3s ease",
          }}
        />
      </Stack>

      {collapsible ? (
        <Collapse in={open} timeout="auto" unmountOnExit>
          {children}
        </Collapse>
      ) : (
        children
      )}
    </Box>
  );
}
