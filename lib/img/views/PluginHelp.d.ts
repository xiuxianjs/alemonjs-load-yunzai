import type { PluginDef } from '@src/path.js';
import React from 'react';
interface PluginHelpProps {
    data: {
        plugins: PluginDef[];
    };
}
export default function PluginHelp({ data }: PluginHelpProps): React.JSX.Element;
export {};
