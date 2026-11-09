import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'apps/**', 'artifacts/**', '.atl/**', '.local-tools/**', 'src/presentation/cart/public/generated/**', 'src/presentation/admin/public/generated/**', 'src/presentation/seo/public/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
