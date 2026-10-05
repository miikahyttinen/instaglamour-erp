import type { Partner } from '../../api/types';

interface PartnerOptionsProps {
  partners: Partner[] | undefined;
}

export function PartnerOptions({ partners }: PartnerOptionsProps) {
  return (
    <>
      {partners?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
}
