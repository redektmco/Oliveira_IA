// Public identity fields only. Never infer a corporate registration or an inbox.
export const legalIdentity={
 name:import.meta.env.VITE_LEGAL_COMPANY_NAME?.trim()||'Oliveira Assessoria de Marketing Ltda.',
 cnpj:import.meta.env.VITE_LEGAL_CNPJ?.trim()||'53.328.793/0001-39',
 email:import.meta.env.VITE_LEGAL_CONTACT_EMAIL?.trim()||'ktm.ferramentas@v4company.com',
};
