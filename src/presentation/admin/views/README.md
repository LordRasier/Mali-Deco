# Administrative server views

[admin](admin.hbs) renders the login and authenticated shell; [admin-section](admin-section.hbs) is an authorized development placeholder, not a fake operational screen. Registered product/order/settings templates receive fixed, escaped provider models after [AdminPage](../admin-page.ts) authorizes the section. Product views are [list](admin-products-list.hbs), [form](admin-product-form.hbs) and [detail](admin-product-detail.hbs).

The browser owns hash navigation and retains visited section DOM. Do not introduce inline scripts, event attributes or serialized credentials. The section loader expects exactly one `section[data-admin-section]` root; later operational partials must preserve that contract. See [the module entry](../README.md).
