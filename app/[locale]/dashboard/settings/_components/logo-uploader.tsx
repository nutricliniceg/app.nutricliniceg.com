'use client';

import { FileUploader } from '@carbon/react';

// UI-13: FileUploader split out of the settings first-load bundle.
export default function LogoUploader({
  labelTitle, labelDescription, buttonLabel, accept, onAddFiles,
}: {
  labelTitle: string;
  labelDescription: string;
  buttonLabel: string;
  accept: string[];
  onAddFiles: (event: React.SyntheticEvent<HTMLElement>, content: { addedFiles: File[] }) => void;
}) {
  return (
    <FileUploader
      labelTitle={labelTitle}
      labelDescription={labelDescription}
      buttonLabel={buttonLabel}
      filenameStatus="edit"
      accept={accept}
      onAddFiles={onAddFiles}
    />
  );
}
