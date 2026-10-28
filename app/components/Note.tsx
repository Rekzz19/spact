type NoteProps = {
  title: string;
  body: string;
};

export default function Note({ title, body }: NoteProps) {
  return (
    <article className="mx-auto w-full max-w-3xl break-words">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">{title}</h1>
      <div className="whitespace-pre-wrap text-lg leading-relaxed">{body}</div>
    </article>
  );
}
