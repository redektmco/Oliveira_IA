import { test, expect } from "@playwright/test";

test("ficha mantém notas, etiquetas, documentos e agenda vinculados ao cliente", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto('/app');
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.goto('/app#contacts');
  await page
    .getByRole("link", { name: "Contato de exemplo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Contato de exemplo", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".breadcrumb")).toContainText("Contato de exemplo");
  await page
    .getByRole("textbox", { name: "Nota interna" })
    .fill("Cliente pediu uma demonstração na próxima semana.");
  await page.getByRole("button", { name: "Salvar nota", exact: true }).click();
  await page.getByRole("tab", { name: "Notas", exact: true }).click();
  await expect(page.locator(".profile-notes")).toContainText(
    "Cliente pediu uma demonstração",
  );
  await page.getByRole("button", { name: "+ Adicionar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nova etiqueta" })
    .fill("Construção civil");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.locator(".profile-tag-list")).toContainText(
    "Construção civil",
  );
  await page.getByRole("tab", { name: /Arquivos/ }).click();
  await page
    .getByRole("textbox", { name: "Nome do documento" })
    .fill("Proposta");
  await page
    .getByRole("textbox", { name: "Link do documento" })
    .fill("https://example.com/proposta.pdf");
  await page.getByRole("button", { name: "Adicionar documento" }).click();
  await expect(page.getByRole("link", { name: "Proposta ↗" })).toHaveAttribute(
    "href",
    "https://example.com/proposta.pdf",
  );
  await page.reload();
  await expect(page.locator(".profile-tag-list")).toContainText(
    "Construção civil",
  );
  await page
    .getByRole("button", { name: "Agendar reunião", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Agendar reunião" });
  await expect(
    dialog.getByRole("combobox", { name: "Contato", exact: true }),
  ).toHaveValue("demo-contact");
  await dialog.getByLabel("Título *", { exact: true }).fill("Reunião da ficha");
  await dialog.getByRole("button", { name: "Salvar reunião" }).click();
  await expect(
    page.getByRole("heading", { name: "Reunião da ficha" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Iniciar conversa", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /Conversa/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Assumir conversa" }).click();
  await page
    .getByLabel("Resposta da equipe")
    .fill("Vou preparar a apresentação.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".profile-message")).toContainText(
    "Vou preparar a apresentação.",
  );
  await page.getByRole("button", { name: "Retomar IA" }).click();
  await expect(page.getByRole("button", { name: "Pausar IA" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar mensagem" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("ficha adapta o design ao celular e oferece navegação por teclado nas abas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await page.goto('/app#contacts/demo-contact');
  await expect(
    page.getByRole("heading", { name: "Contato de exemplo", exact: true }),
  ).toBeVisible();
  const activity = page.getByRole("tab", { name: "Atividade" });
  await activity.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Conversa/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Arquivos/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(activity).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const box = await page
    .getByRole("button", { name: "Agendar reunião", exact: true })
    .boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
