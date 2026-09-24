/**
 * SVG icon library — thin wrappers matching the icon set used in the design.
 * All paths are from the Feather icon set (MIT licence) as used in the design file.
 */
import React from 'react';
import Svg, { Path, Polyline, Circle, Line, Polygon, Rect } from 'react-native-svg';

interface IconProps { size?: number; color?: string; strokeWidth?: number; }

const D = ({ size = 20, color = '#fff', strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </Svg>
);

export const WaveformIcon = ({ size = 48, color = '#fff' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Path d="M5 26 H13 l3-9 4 19 4-26 4 18 3-8 H43" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MenuIcon     = (p: IconProps) => <D {...p}><Line x1="3" y1="12" x2="21" y2="12" /><Line x1="3" y1="6" x2="21" y2="6" /><Line x1="3" y1="18" x2="21" y2="18" /></D>;
export const ChevronLeft  = (p: IconProps) => <D {...p}><Polyline points="15 18 9 12 15 6" /></D>;
export const ChevronRight = (p: IconProps) => <D {...p}><Polyline points="9 18 15 12 9 6" /></D>;
export const ChevronDown  = (p: IconProps) => <D {...p}><Polyline points="6 9 12 15 18 9" /></D>;
export const SettingsIcon = (p: IconProps) => (
  <D {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </D>
);
export const PlusIcon     = (p: IconProps) => <D {...p}><Line x1="12" y1="5" x2="12" y2="19" /><Line x1="5" y1="12" x2="19" y2="12" /></D>;
export const SearchIcon   = (p: IconProps) => <D {...p}><Circle cx="11" cy="11" r="8" /><Line x1="21" y1="21" x2="16.65" y2="16.65" /></D>;
export const FilterIcon   = (p: IconProps) => <D {...p}><Polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></D>;
export const CheckIcon    = (p: IconProps) => <D {...p}><Polyline points="20 6 9 17 4 12" /></D>;
export const XIcon        = (p: IconProps) => <D {...p}><Line x1="18" y1="6" x2="6" y2="18" /><Line x1="6" y1="6" x2="18" y2="18" /></D>;
export const EditIcon     = (p: IconProps) => <D {...p}><Path d="M12 20h9" /><Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></D>;
export const TrashIcon    = (p: IconProps) => <D {...p}><Polyline points="3 6 5 6 21 6" /><Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><Line x1="10" y1="11" x2="10" y2="17" /><Line x1="14" y1="11" x2="14" y2="17" /></D>;
export const DownloadIcon = (p: IconProps) => <D {...p}><Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><Polyline points="7 10 12 15 17 10" /><Line x1="12" y1="15" x2="12" y2="3" /></D>;
export const GridIcon     = (p: IconProps) => <D {...p}><Rect x="3" y="4" width="18" height="16" rx="2" /><Line x1="3" y1="10" x2="21" y2="10" /><Line x1="9" y1="10" x2="9" y2="20" /></D>;
export const SpeakerIcon  = (p: IconProps) => <D {...p}><Path d="M11 5 6 9H2v6h4l5 4V5z" /><Path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></D>;
export const BluetoothIcon = (p: IconProps) => <D {...p}><Path d="m7 7 10 10-5 5V2l5 5L7 17" /></D>;
export const AlertTriangleIcon = (p: IconProps) => <D {...p}><Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><Line x1="12" y1="9" x2="12" y2="13" /><Line x1="12" y1="17" x2="12.01" y2="17" /></D>;
export const AlertCircleIcon = (p: IconProps) => <D {...p}><Circle cx="12" cy="12" r="10" /><Line x1="12" y1="8" x2="12" y2="12" /><Line x1="12" y1="16" x2="12.01" y2="16" /></D>;
export const HeartIcon    = (p: IconProps) => <D {...p}><Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></D>;
export const ActivityIcon = (p: IconProps) => <D {...p}><Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></D>;
export const LogoutIcon   = (p: IconProps) => <D {...p}><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Polyline points="16 17 21 12 16 7" /><Line x1="21" y1="12" x2="9" y2="12" /></D>;
export const FileTextIcon = (p: IconProps) => <D {...p}><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><Polyline points="14 2 14 8 20 8" /><Line x1="8" y1="13" x2="16" y2="13" /><Line x1="8" y1="17" x2="13" y2="17" /></D>;
export const VideoIcon    = (p: IconProps) => <D {...p}><Polygon points="23 7 16 12 23 17 23 7" /><Rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></D>;
export const PlayIcon     = (p: IconProps) => <D {...p}><Polygon points="5 3 19 12 5 21 5 3" /></D>;
export const MicIcon      = (p: IconProps) => <D {...p}><Rect x="9" y="2" width="6" height="11" rx="3" /><Path d="M19 10v2a7 7 0 0 1-14 0v-2" /><Line x1="12" y1="19" x2="12" y2="22" /><Line x1="8" y1="22" x2="16" y2="22" /></D>;
export const StopIcon     = (p: IconProps) => <D {...p}><Rect x="3" y="3" width="18" height="18" rx="2" /></D>;
export const PauseIcon    = (p: IconProps) => <D {...p}><Rect x="6" y="4" width="4" height="16" /><Rect x="14" y="4" width="4" height="16" /></D>;
export const ClockIcon        = (p: IconProps) => <D {...p}><Circle cx="12" cy="12" r="10" /><Polyline points="12 6 12 12 16 14" /></D>;
export const UserIcon         = (p: IconProps) => <D {...p}><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" /></D>;
export const CheckCircleIcon  = (p: IconProps) => <D {...p}><Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><Polyline points="22 4 12 14.01 9 11.01" /></D>;
export const WifiOffIcon      = (p: IconProps) => <D {...p}><Line x1="1" y1="1" x2="23" y2="23" /><Path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><Path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><Path d="M10.71 5.05A16 16 0 0 1 22.56 9" /><Path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><Path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><Line x1="12" y1="20" x2="12.01" y2="20" /></D>;
export const CameraIcon = (p: IconProps) => <D {...p}><Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><Circle cx="12" cy="13" r="4" /></D>;
export const QrCodeIcon  = (p: IconProps) => <D {...p}><Rect x="3" y="3" width="7" height="7" /><Rect x="14" y="3" width="7" height="7" /><Rect x="3" y="14" width="7" height="7" /><Line x1="14" y1="14" x2="14" y2="14" /><Line x1="17" y1="14" x2="20" y2="14" /><Line x1="20" y1="14" x2="20" y2="20" /><Line x1="17" y1="20" x2="20" y2="20" /><Line x1="14" y1="17" x2="17" y2="17" /></D>;
export const ShareIcon   = (p: IconProps) => <D {...p}><Circle cx="18" cy="5" r="3" /><Circle cx="6" cy="12" r="3" /><Circle cx="18" cy="19" r="3" /><Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></D>;
