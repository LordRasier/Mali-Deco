'use client';
import type { OrderInput } from '../lib/checkout-client';

type Props = {
  contact: OrderInput['contact'];
  address: OrderInput['address'];
  setContact: (value: OrderInput['contact']) => void;
  setAddress: (value: OrderInput['address']) => void;
  disabled: boolean;
};
export function CheckoutContact({ contact, address, setContact, setAddress, disabled }: Props) {
  return <>
    <section className="checkout-section">
      <h2>Contacto</h2>
      {(['name', 'email', 'phone'] as const).map((field, i) => <div key={field}>
        <label htmlFor={`checkout-${field}`}>{['Nombre', 'Correo electrónico', 'Teléfono'][i]}</label>
        <input id={`checkout-${field}`} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
          autoComplete={field === 'name' ? 'name' : field === 'email' ? 'email' : 'tel'} required
          value={contact[field]} disabled={disabled} onChange={e => setContact({ ...contact, [field]: e.target.value })} />
      </div>)}
    </section>
    <section className="checkout-section">
      <h2>Dirección</h2>
      {(['street', 'number', 'unit'] as const).map((field, i) => <div key={field}>
        <label htmlFor={`checkout-${field}`}>{['Calle', 'Número', 'Piso o departamento (opcional)'][i]}</label>
        <input id={`checkout-${field}`} required={field !== 'unit'} value={address[field]} disabled={disabled}
          onChange={e => setAddress({ ...address, [field]: e.target.value })} />
      </div>)}
    </section>
  </>;
}
