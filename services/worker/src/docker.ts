// TODO: docker build / run with resource limits / teardown
export async function buildImage(_contextDir: string, _tag: string): Promise<void> {
  throw new Error('Not implemented');
}

export async function runContainer(_image: string): Promise<{ id: string; port: number }> {
  throw new Error('Not implemented');
}

export async function removeContainer(_id: string): Promise<void> {
  throw new Error('Not implemented');
}
