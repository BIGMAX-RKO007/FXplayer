import { useState } from 'react';
import { X, Package } from 'lucide-react';
import { AssetDefinition } from '../types/scene';
import { ASSET_LIBRARY } from '../data/assets';

interface AssetLibraryPanelProps {
  onAddAsset: (asset: AssetDefinition, scale: number) => void;
  onClose: () => void;
}

export function AssetLibraryPanel({ onAddAsset, onClose }: AssetLibraryPanelProps) {
  const [scale, setScale] = useState(1.0);
  const [adding, setAdding] = useState<string | null>(null);

  async function handleAdd(asset: AssetDefinition) {
    setAdding(asset.id);
    onAddAsset(asset, scale);
    // 短暂反馈后重置
    setTimeout(() => setAdding(null), 600);
  }

  return (
    <div className="asset-library-panel">
      {/* 标题栏 */}
      <div className="asset-library-header">
        <div className="asset-library-title">
          <Package size={14} />
          <span>素材库</span>
          <span className="asset-library-count">{ASSET_LIBRARY.length} 个资产</span>
        </div>
        <button className="log-action-btn" onClick={onClose} title="关闭">
          <X size={13} />
        </button>
      </div>

      {/* Scale 滑块 */}
      <div className="asset-scale-row">
        <span className="asset-scale-label">缩放</span>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          value={scale}
          onChange={e => setScale(Number(e.target.value))}
          className="asset-scale-slider"
        />
        <span className="asset-scale-value">{scale.toFixed(1)}×</span>
      </div>

      {/* 资产卡片列表 */}
      <div className="asset-grid">
        {ASSET_LIBRARY.map(asset => (
          <div key={asset.id} className="asset-card">
            <div className="asset-icon">{asset.icon}</div>
            <div className="asset-info">
              <div className="asset-name">{asset.displayName}</div>
              <div className="asset-desc">{asset.description}</div>
              {asset.hasAnimations && (
                <div className="asset-anims">
                  {asset.availableAnimations.map(a => (
                    <span key={a} className="asset-anim-badge">{a}</span>
                  ))}
                </div>
              )}
            </div>
            <button
              className={`asset-add-btn ${adding === asset.id ? 'added' : ''}`}
              onClick={() => handleAdd(asset)}
            >
              {adding === asset.id ? '✓' : '+'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
