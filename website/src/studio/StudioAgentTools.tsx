import { useEffect, useRef } from 'react';

import { registerStudioTools } from './webmcp';
import type { StudioToolDeps } from './webmcp';

export interface StudioAgentToolsStatus {
  supported: boolean;
  registered: string[];
}

export interface StudioAgentToolsProps {
  deps: StudioToolDeps;
  onStatus?(status: StudioAgentToolsStatus): void;
}

export default function StudioAgentTools({
  deps,
  onStatus,
}: StudioAgentToolsProps) {
  const depsRef = useRef(deps);
  const onStatusRef = useRef(onStatus);
  depsRef.current = deps;
  onStatusRef.current = onStatus;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const liveDeps: StudioToolDeps = {
      getState: () => depsRef.current.getState(),
      dispatch: (action) => depsRef.current.dispatch(action),
      compile: (draft) => depsRef.current.compile(draft),
      detect: (draft) => depsRef.current.detect(draft),
      renderConfig: (draft) => depsRef.current.renderConfig(draft),
      get inspectSite() {
        return depsRef.current.inspectSite;
      },
    };

    void registerStudioTools(liveDeps, { signal: controller.signal }).then((result) => {
      if (active) {
        onStatusRef.current?.({
          supported: result.surface !== 'none',
          registered: result.registered,
        });
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return null;
}
