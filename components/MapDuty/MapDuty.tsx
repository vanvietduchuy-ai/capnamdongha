import { Avatar } from '../UI';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, Rectangle, Popup, Marker, Polyline, useMap, LayersControl, Tooltip, Circle, ImageOverlay } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';
import 'leaflet-rotate';
import { User, UserRole, DutyInfo } from '../../types';
import { Select } from '../UI'; 
import { Locate, Navigation, Layers, RotateCcw, RotateCw, Menu, X, MapPin, User as UserIcon, Shield, ArrowLeft, Trash2, Sparkles, Brain, Maximize, Minimize, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DutyList } from './DutyList';
import { GoogleGenAI, Type } from "@google/genai";

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icons
const userLocationIcon = new L.DivIcon({
  className: 'custom-user-location-icon',
  html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface Zone {
  id: string;
  type: 'Polygon' | 'Rectangle' | 'Polyline' | 'Label';
  positions: any; // Leaflet format: LatLng[] for Polyline/Polygon, LatLng for Marker
  label: string;
  description?: string;
  assignedUserIds: string[];
  color: string;
  fillColor: string;
  textColor: string;
  dutyId?: string;
}

interface MapDutyProps {
  currentUser: User;
  users: User[];
  isLeader: boolean;
}

// Custom hook for Draw Control using Leaflet Geoman
const EditControl = ({ onCreated, onEdited, drawEnabled, defaultColor, defaultFillColor }: any) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !map.pm) return;

    // Initialize Geoman controls
    if (drawEnabled) {
      map.pm.addControls({
        position: 'topright',
        drawMarker: true,
        drawPolyline: true,
        drawRectangle: true,
        drawPolygon: true,
        drawCircle: false,
        drawCircleMarker: false,
        drawText: false,
        editMode: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: false,
        rotateMode: true,
      });

      // Set global options for better look and feel
      map.pm.setGlobalOptions({
        pathOptions: {
          color: defaultColor || '#f59e0b',
          fillColor: defaultFillColor || '#fcd34d',
          fillOpacity: 0.4,
          weight: 2,
        },
        templineStyle: {
          color: defaultColor || '#f59e0b',
          dashArray: [5, 5],
        },
        hintlineStyle: {
          color: defaultColor || '#f59e0b',
          dashArray: [5, 5],
        },
        markerStyle: {
          draggable: true,
          icon: new L.DivIcon({
            className: 'custom-label-icon',
            html: `<div class="w-6 h-6 bg-white rounded-full border-2 border-stone-600 flex items-center justify-center shadow-lg"><span class="text-stone-600 text-[10px] font-bold">T</span></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })
        }
      });

      // Event Handlers
      const handleCreated = (e: any) => {
        // Geoman event structure is slightly different
        const layer = e.layer;
        const type = e.shape; // 'Marker', 'Line', 'Rectangle', 'Polygon'
        
        // Map Geoman types to our Zone types
        let zoneType: any = type;
        if (type === 'Marker') zoneType = 'Label';
        if (type === 'Line') zoneType = 'Polyline';

        onCreated && onCreated({
          layerType: zoneType,
          layer: layer
        });
        
        // Remove the temporary layer as we will re-render it from state
        map.removeLayer(layer);
      };

      const handleEdited = (e: any) => {
        onEdited && onEdited(e);
      };

      map.on('pm:create', handleCreated);
      map.on('pm:globaleditmodetoggled', (e) => {
        if (!e.enabled) {
          // When edit mode is disabled, trigger update
          onEdited && onEdited({ layers: map.pm.getGeomanLayers() });
        }
      });

      return () => {
        map.pm.removeControls();
        map.off('pm:create', handleCreated);
      };
    } else {
      map.pm.removeControls();
    }
  }, [map, drawEnabled, defaultColor, defaultFillColor]);

  return null;
};

// Component to handle map view updates and events
const MapUpdater = ({ center, zoom, setRotation, bounds }: { center: L.LatLngExpression, zoom: number, setRotation: (r: number) => void, bounds?: L.LatLngBoundsExpression }) => {
  const map = useMap();
  
  useEffect(() => {
    if (bounds) {
      // Only fit bounds once or when bounds change
      map.fitBounds(bounds, { padding: [10, 10], animate: true });
      // Set max bounds to prevent panning away from the image
      map.setMaxBounds(bounds);
    } else {
      map.setView(center, zoom);
      map.setMaxBounds(null as any);
    }
  }, [map, bounds]); // Removed center and zoom from dependencies to prevent auto-zoom-out when user interacts

  useEffect(() => {
    const handleRotate = () => {
      // @ts-ignore
      setRotation(map.getBearing());
    };
    // @ts-ignore
    map.on('rotate', handleRotate);
    return () => {
      // @ts-ignore
      map.off('rotate', handleRotate);
    };
  }, [map, setRotation]);

  return null;
};

const MapEvents = ({ onZoomChange }: { onZoomChange: (z: number) => void }) => {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    // Initial zoom
    onZoomChange(map.getZoom());
    return () => { map.off('zoomend', handler); };
  }, [map, onZoomChange]);
  return null;
};

const GridLayer = ({ show, isImageMap, imageHeight, imageWidth }: { show: boolean, isImageMap: boolean, imageHeight?: number, imageWidth?: number }) => {
  const map = useMap();
  const gridRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (gridRef.current) {
      map.removeLayer(gridRef.current);
      gridRef.current = null;
    }

    if (!show) return;

    const grid = L.layerGroup();
    const color = '#cbd5e1';
    const weight = 0.5;
    const opacity = 0.5;

    if (isImageMap && imageHeight && imageWidth) {
      // Draw grid for image map (Simple CRS)
      const step = 50; // 50 units
      for (let x = 0; x <= imageWidth; x += step) {
        L.polyline([[0, x], [imageHeight, x]], { color, weight, opacity }).addTo(grid);
      }
      for (let y = 0; y <= imageHeight; y += step) {
        L.polyline([[y, 0], [y, imageWidth]], { color, weight, opacity }).addTo(grid);
      }
    } else {
      // Draw grid for real map
      // This is harder for real maps, so we'll just draw a simple one around the center
      const center = map.getCenter();
      const step = 0.001; // roughly 100m
      for (let i = -20; i <= 20; i++) {
        const lat = center.lat + i * step;
        const lng = center.lng + i * step;
        L.polyline([[lat, center.lng - 20 * step], [lat, center.lng + 20 * step]], { color, weight, opacity }).addTo(grid);
        L.polyline([[center.lat - 20 * step, lng], [center.lat + 20 * step, lng]], { color, weight, opacity }).addTo(grid);
      }
    }

    grid.addTo(map);
    gridRef.current = grid;

    return () => {
      if (gridRef.current) map.removeLayer(gridRef.current);
    };
  }, [map, show, isImageMap, imageHeight, imageWidth]);

  return null;
};

// Helper to calculate center and angle for polyline labels
const getPolylineData = (positions: any) => {
  let points = positions;
  // Handle nested arrays (Leaflet often returns [[lat, lng], ...] for polygons/lines)
  if (Array.isArray(positions) && positions.length > 0 && Array.isArray(positions[0]) && typeof positions[0][0] !== 'number') {
      points = positions[0];
  }
  
  if (!Array.isArray(points) || points.length < 2) return { center: null, angle: 0 };

  // Use middle segment
  const mid = Math.floor(points.length / 2);
  const p1 = points[mid > 0 ? mid - 1 : 0];
  const p2 = points[mid];
  
  // Normalize points to objects
  const lat1 = (p1.lat !== undefined ? p1.lat : p1[0]);
  const lng1 = (p1.lng !== undefined ? p1.lng : p1[1]);
  const lat2 = (p2.lat !== undefined ? p2.lat : p2[0]);
  const lng2 = (p2.lng !== undefined ? p2.lng : p2[1]);

  if (lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) return { center: null, angle: 0 };

  const center: L.LatLngExpression = [(lat1 + lat2) / 2, (lng1 + lng2) / 2];
  
  // Calculate angle for screen rotation (Screen Y is down, Map Lat is up)
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  
  // Calculate angle in degrees
  // We use -dy because screen Y is inverted relative to latitude
  let angle = Math.atan2(-dy, dx) * 180 / Math.PI;
  
  // Normalize angle to keep text readable (avoid upside down)
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  
  return { center, angle };
};

// Custom Controls Component
const MapControls = ({ rotation, isLocating, onLocate, isImageMap, imageBounds, showGrid, onToggleGrid, containerRef }: { rotation: number, isLocating: boolean, onLocate: () => void, isImageMap?: boolean, imageBounds?: L.LatLngBoundsExpression, showGrid?: boolean, onToggleGrid?: () => void, containerRef?: React.RefObject<HTMLDivElement> }) => {
  const map = useMap();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleResetView = () => {
    if (isImageMap && imageBounds) {
      map.fitBounds(imageBounds, { padding: [20, 20], animate: true });
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef?.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => map.invalidateSize(), 300);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [map]);

  return (
    <div className="leaflet-bottom leaflet-right hidden md:block" style={{ bottom: '24px', right: '12px', pointerEvents: 'auto', zIndex: 1000 }}>
       <div className="flex flex-col gap-2">
          {/* Fullscreen Toggle */}
          <button 
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            className="bg-white p-2 rounded shadow-lg hover:bg-stone-50 text-stone-600 flex items-center justify-center w-10 h-10 transition-all active:scale-95"
            title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          {/* Grid Toggle */}
          {onToggleGrid && (
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleGrid(); }}
              className={`p-2 rounded shadow-lg flex items-center justify-center w-10 h-10 transition-all active:scale-95 ${showGrid ? 'bg-blue-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
              title={showGrid ? "Tắt lưới" : "Hiện lưới"}
            >
              <Layers size={18} />
            </button>
          )}

          {/* Zoom Controls */}
          <div className="flex flex-col bg-white rounded shadow-lg overflow-hidden border border-stone-200">
            <button 
              onClick={(e) => { e.stopPropagation(); map.zoomIn(); }}
              className="p-2 hover:bg-stone-50 text-stone-600 flex items-center justify-center w-10 h-10 transition-all active:scale-95 border-b border-stone-100"
              title="Phóng to"
            >
              <Navigation className="rotate-0" size={18} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); map.zoomOut(); }}
              className="p-2 hover:bg-stone-50 text-stone-600 flex items-center justify-center w-10 h-10 transition-all active:scale-95"
              title="Thu nhỏ"
            >
              <ArrowLeft className="-rotate-90" size={18} />
            </button>
          </div>

          {/* Reset View Button */}
          {isImageMap && imageBounds && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleResetView(); }}
              className="bg-white p-2 rounded shadow-lg hover:bg-stone-50 text-stone-600 flex items-center justify-center w-10 h-10 transition-all active:scale-95"
              title="Xem toàn bộ sơ đồ"
            >
              <RotateCcw size={18} />
            </button>
          )}

          {/* Rotation Controls */}
          <div className="flex flex-col bg-white rounded shadow-lg overflow-hidden border border-stone-200">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                // @ts-ignore
                map.setBearing((map.getBearing() || 0) - 15); 
              }}
              className="p-2 hover:bg-stone-50 text-stone-600 flex items-center justify-center w-10 h-10 transition-all active:scale-95 border-b border-stone-100"
              title="Xoay trái"
            >
              <RotateCcw size={18} />
            </button>
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                // @ts-ignore
                map.setBearing((map.getBearing() || 0) + 15); 
              }}
              className="p-2 hover:bg-stone-50 text-stone-600 flex items-center justify-center w-10 h-10 transition-all active:scale-95"
              title="Xoay phải"
            >
              <RotateCw size={18} />
            </button>
          </div>

          {Math.round(rotation) !== 0 && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                // @ts-ignore
                map.setBearing(0);
              }}
              className="bg-white p-2 rounded shadow-lg hover:bg-stone-50 text-stone-600 flex items-center justify-center w-10 h-10 transition-all active:scale-95"
              title="Đặt lại góc xoay"
            >
              <RotateCcw size={18} />
            </button>
          )}
          
          {!isImageMap && (
            <button 
              onClick={(e) => {
                 e.stopPropagation();
                 onLocate();
              }}
              className={`bg-white p-2 rounded shadow-lg hover:bg-stone-50 w-10 h-10 flex items-center justify-center transition-all active:scale-95 ${isLocating ? 'animate-pulse text-blue-600' : 'text-stone-600'}`}
              title="Vị trí của tôi"
            >
              <Locate size={18} />
            </button>
          )}
       </div>
    </div>
  );
};

// Removed local DutyInfo interface as it is now in types.ts

const getLabelHtml = (label: string, assignedUsers: any[], textColor: string, angle: number = 0, isPolygon: boolean = false, isMyZone: boolean = false, isMobile: boolean = false) => {
  const namesHtml = assignedUsers.map(u => `<span style="background-color: #f3f4f6; color: #374151; font-size: ${isMobile ? '12px' : '10px'}; padding: 2px 4px; border-radius: 4px; margin-left: 4px; white-space: nowrap; border: 1px solid #d1d5db; display: inline-block; vertical-align: middle;">${u.fullName}</span>`).join('');
  
  const avatarsContainer = assignedUsers.length > 0 ? `<div style="display: inline-block; margin-left: 4px; padding-left: 4px; border-left: 1px solid #ccc; vertical-align: middle;">${namesHtml}</div>` : '';

  const myZoneBadge = isMyZone ? `<div style="background-color: #ef4444; color: white; font-size: ${isMobile ? '10px' : '8px'}; padding: 2px 6px; border-radius: 2px; margin-bottom: 4px; text-align: center; width: fit-content; margin-left: auto; margin-right: auto; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Vị trí nhiệm vụ của bạn</div>` : '';

  const fontSize = isMobile ? (isPolygon ? '18px' : '14px') : (isPolygon ? '14px' : '11px');
  const fontWeight = isMobile ? '800' : '500';

  if (isPolygon) {
    return `<div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: ${textColor || '#ffffff'}; 
      font-weight: 800; 
      font-size: ${fontSize}; 
      text-shadow: 0 0 4px rgba(0,0,0,0.7);
      white-space: nowrap;
      transform: translate(-50%, -50%);
    ">
      ${myZoneBadge}
      <div style="display: flex; align-items: center; gap: 6px;">
        <span>${label}</span>
        ${assignedUsers.length > 0 ? `<div style="display: flex; align-items: center; margin-left: 4px;">${namesHtml}</div>` : ''}
      </div>
    </div>`;
  }

  return `<div style="display: flex; flex-direction: column; align-items: center; transform: rotate(${angle}deg);">
    ${myZoneBadge}
    <div style="
      background-color: #ffffff; 
      border: 2px solid #666666; 
      padding: ${isMobile ? '4px 10px' : '2px 6px'}; 
      border-radius: 6px; 
      font-size: ${fontSize}; 
      font-weight: ${fontWeight}; 
      color: ${textColor || '#000000'}; 
      white-space: nowrap; 
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      display: inline-flex;
      align-items: center;
    ">
      <span style="vertical-align: middle;">${label}</span>
      ${avatarsContainer}
    </div>
  </div>`;
};

export const MapDuty: React.FC<MapDutyProps> = ({ currentUser, users, isLeader }) => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [duties, setDuties] = useState<DutyInfo[]>([]);
  const [modalMapType, setModalMapType] = useState<'real' | 'image'>('real');
  
  // New State for Duty Info and User Search
  const [dutyInfo, setDutyInfo] = useState<DutyInfo | null>(null);
  const [showDutyModal, setShowDutyModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const isMobile = window.innerWidth < 768;
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [userLocation, setUserLocation] = useState<L.LatLng | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isRotating, setIsRotating] = useState(false); // Track if currently rotating via gesture
  const [showGrid, setShowGrid] = useState(false); // New: Toggle grid
  const [defaultColor, setDefaultColor] = useState('#f59e0b'); // Default drawing color
  const [defaultFillColor, setDefaultFillColor] = useState('#fcd34d');
  const [defaultTextColor, setDefaultTextColor] = useState('#000000');

  // Default center (Dong Ha, Quang Tri)
  const defaultCenter: L.LatLngExpression = [16.8079, 107.1015]; 
  const [mapCenter, setMapCenter] = useState<L.LatLngExpression>(defaultCenter);
  const [mapZoom, setMapZoom] = useState(14);
  const [currentZoom, setCurrentZoom] = useState(14);

  // Refs for gesture handling
  const containerRef = useRef<HTMLDivElement>(null);
  const [fgInstance, setFgInstance] = useState<L.FeatureGroup | null>(null);
  // const initialAngleRef = useRef<number | null>(null);
  // const initialRotationRef = useRef<number>(0);

  // Load data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      // Fetch all duties
      const { data: dutiesData, error: dutiesError } = await supabase
        .from('duty_info')
        .select('*')
        .order('createdAt', { ascending: false });

      if (dutiesData) {
        setDuties(dutiesData);
      }
      
      // If there's an active duty, maybe select it? 
      // User requested to select from list, so we default to list view.
    };

    fetchData();

    // Real-time subscriptions
    const channel = supabase
      .channel('map_duty_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_zones' }, (payload) => {
        if (payload.eventType === 'INSERT') {
           // Only add if belongs to current duty
           const newZone = payload.new as Zone;
           if (dutyInfo && newZone.dutyId === dutyInfo.id) {
              setZones(prev => [...prev, newZone]);
           }
        } else if (payload.eventType === 'UPDATE') {
           setZones(prev => prev.map(z => z.id === payload.new.id ? payload.new as Zone : z));
        } else if (payload.eventType === 'DELETE') {
           setZones(prev => prev.filter(z => z.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_info' }, (payload) => {
         // Refresh duties list
         fetchData();
         
         // Update current duty if it changed
         if (dutyInfo && payload.new && (payload.new as any).id === dutyInfo.id) {
            setDutyInfo(payload.new as DutyInfo);
         }
      })
      .subscribe();

    // Handle resize
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      supabase.removeChannel(channel);
    };
  }, []);

  // Geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation(new L.LatLng(latitude, longitude));
      },
      (error) => {
        console.error("Error getting location", error);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Auto-delete check (Client side fallback, ideally server job)
  useEffect(() => {
    const checkExpiry = async () => {
      if (dutyInfo && dutyInfo.endTime && isLeader) {
        const now = new Date();
        const end = new Date(dutyInfo.endTime);
        if (now > end) {
           // Deactivate duty in DB
           await supabase.from('duty_info').update({ isActive: false }).eq('id', dutyInfo.id);
           console.log("Duty expired and deactivated");
        }
      }
    };

    const interval = setInterval(checkExpiry, 60000); // Check every minute
    checkExpiry(); // Check immediately
    return () => clearInterval(interval);
  }, [dutyInfo, isLeader]);

  const handleSelectDuty = async (duty: DutyInfo) => {
    setDutyInfo(duty);
    
    // Fetch zones for this duty
    const { data: zonesData } = await supabase
      .from('map_zones')
      .select('*')
      .eq('dutyId', duty.id);
      
    if (zonesData) {
      setZones(zonesData);
    } else {
      setZones([]);
    }
    
    setViewMode('map');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setDutyInfo(null);
    setZones([]);
  };

  const handleCreateDuty = () => {
     if (!isLeader) return;
     setDutyInfo(null); // Clear for new
     setModalMapType('real');
     setShowDutyModal(true);
  };
  
  const handleEditDuty = (duty: DutyInfo) => {
     if (!isLeader) return;
     setDutyInfo(duty);
     setModalMapType(duty.mapType || 'real');
     setShowDutyModal(true);
  };
  
  const handleDeleteDuty = async (duty: DutyInfo) => {
     if (!isLeader) return;
     if (confirm(`Bạn có chắc chắn muốn xóa sự kiện "${duty.title}"?`)) {
        const { error } = await supabase.from('duty_info').delete().eq('id', duty.id);
        if (error) {
           console.error("Error deleting duty:", error);
           alert("Lỗi khi xóa sự kiện.");
        } else {
           setDuties(prev => prev.filter(d => d.id !== duty.id));
        }
     }
  };

  const handleSaveDutyInfo = async (info: any) => {
    if (!isLeader) return;
    if (!info) {
      setShowDutyModal(false);
      return;
    }

    try {
      const now = Date.now();
      const id = dutyInfo?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `duty_${now}_${Math.random().toString(36).substring(2, 9)}`);
      
      const newDuty: DutyInfo = {
        id,
        ...info,
        isActive: true,
        createdAt: dutyInfo?.createdAt || now,
        updatedAt: now
      };
      
      console.log("Saving duty info:", newDuty);
      
      const { error } = await supabase.from('duty_info').upsert(newDuty);
      
      if (error) {
        console.error("Supabase error saving duty info:", error);
        alert(`Lỗi từ cơ sở dữ liệu: ${error.message || JSON.stringify(error)}`);
        return; // Keep modal open on error
      }
      
      // Update local list
      const { data, error: fetchError } = await supabase
        .from('duty_info')
        .select('*')
        .order('createdAt', { ascending: false });
        
      if (fetchError) {
        console.error("Error fetching duties after save:", fetchError);
      } else if (data) {
        setDuties(data);
      }
      
      // If we were editing or just created, update current view
      if (!dutyInfo || dutyInfo.id === id) {
        setDutyInfo(newDuty);
      }
      
      setShowDutyModal(false);
    } catch (err: any) {
      console.error("Unexpected error in handleSaveDutyInfo:", err);
      alert(`Đã xảy ra lỗi không mong muốn: ${err.message}`);
    }
  };

  const handleExport = () => {
    if (zones.length === 0) {
      alert("Không có dữ liệu để xuất.");
      return;
    }

    const headers = ["Tên chốt", "Loại", "Cán bộ phụ trách"];
    const rows = zones.map(zone => {
      const assigned = users.filter(u => zone.assignedUserIds.includes(u.id));
      const names = assigned.map(u => u.fullName).join(", ");
      return [zone.label, zone.type, names];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Danh_sach_bao_ve_${dutyInfo?.title || 'Export'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreated = async (e: any) => {
    if (!isLeader) {
      if (e.layer) e.layer.remove();
      return;
    }
    if (!dutyInfo) {
      alert("Vui lòng tạo đợt bảo vệ trước khi vẽ!");
      if (e.layer) e.layer.remove();
      return;
    }

    const layer = e.layer;
    const type = e.layerType; // 'Polygon', 'Rectangle', 'Polyline', 'Label' (from our EditControl mapping)
    
    // Extract coordinates
    let positions;
    try {
        if (type === 'Polyline') {
            const latlngs = layer.getLatLngs();
            positions = (latlngs as any[]).map((ll: any) => ({ lat: ll.lat, lng: ll.lng }));
        } else if (type === 'Label') {
            const ll = layer.getLatLng();
            positions = { lat: ll.lat, lng: ll.lng };
        } else {
            // Polygon/Rectangle
            const latlngs = layer.getLatLngs();
            if (Array.isArray(latlngs) && latlngs.length > 0) {
                 if (Array.isArray(latlngs[0]) && typeof latlngs[0][0] !== 'number') {
                     positions = latlngs[0].map((ll: any) => ({ lat: ll.lat, lng: ll.lng }));
                 } else {
                     positions = latlngs.map((ll: any) => ({ lat: ll.lat, lng: ll.lng }));
                 }
            } else {
                positions = [];
            }
        }
    } catch (err) {
        console.error("Error getting coordinates:", err);
        alert("Lỗi khi lấy tọa độ hình vẽ. Vui lòng thử lại.");
        if (e.layer) e.layer.remove();
        return;
    }

    const newZone: Zone = {
      id: crypto.randomUUID(),
      type: type as Zone['type'],
      positions,
      label: type === 'Label' ? 'Tên địa danh' : (type === 'Polyline' ? 'Đường đi' : `Chốt ${zones.length + 1}`),
      assignedUserIds: [],
      color: defaultColor, 
      fillColor: defaultFillColor,
      textColor: defaultTextColor,
      dutyId: dutyInfo.id
    };

    // Save to Supabase
    const { error } = await supabase.from('map_zones').insert(newZone);
    if (error) {
      console.error("Error saving zone:", error);
      alert("Lỗi khi lưu vùng vào cơ sở dữ liệu.");
    }
  };

  const handleEdited = async (e: any) => {
    if (!isLeader) return;
    const layers = e.layers; // This is from map.pm.getGeomanLayers()
    if (!layers || !Array.isArray(layers)) return;

    const updates: any[] = [];

    layers.forEach((layer: any) => {
      // Geoman layers might not have our custom 'id' in options directly if they are the ones being edited
      // We need to make sure we set the ID on the layer when rendering
      const zoneId = layer.options.id;
      if (!zoneId) return;

      let positions;
      if (layer instanceof L.Marker) {
        const ll = layer.getLatLng();
        positions = { lat: ll.lat, lng: ll.lng };
      } else if (layer instanceof L.Polyline) {
        const latlngs = layer.getLatLngs();
        if (Array.isArray(latlngs) && latlngs.length > 0 && Array.isArray(latlngs[0])) {
          positions = (latlngs[0] as any[]).map((ll: any) => ({ lat: ll.lat, lng: ll.lng }));
        } else {
          positions = (latlngs as any[]).map((ll: any) => ({ lat: ll.lat, lng: ll.lng }));
        }
      }

      if (positions) {
        updates.push({ id: zoneId, positions });
      }
    });

    if (updates.length > 0) {
      let successCount = 0;
      for (const update of updates) {
        const { error } = await supabase.from('map_zones').update({ positions: update.positions }).eq('id', update.id);
        if (!error) successCount++;
      }
      if (successCount > 0) {
        alert(`Đã cập nhật vị trí cho ${successCount} khu vực.`);
      }
    }
  };

  const handleAssign = (zone: Zone) => {
    if (!isLeader) return;
    setSelectedZone(zone);
    setUserSearchQuery('');
    setShowAssignModal(true);
  };

  const handleSaveAssignment = async (userIds: string[], label: string, color: string, fillColor: string, textColor: string) => {
    if (!isLeader) return;
    if (!selectedZone) return;
    
    const updates = { assignedUserIds: userIds, label, color, fillColor, textColor };
    
    const { error } = await supabase.from('map_zones').update(updates).eq('id', selectedZone.id);
    
    if (error) {
       console.error("Error updating zone:", error);
       alert("Lỗi khi cập nhật vùng.");
    }

    setShowAssignModal(false);
    setSelectedZone(null);
  };

  const getBase64FromUrl = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleAIDetectZones = async () => {
    if (!isLeader) return;
    if (!dutyInfo?.mapImageUrl) {
      alert("Tính năng này chỉ khả dụng cho sơ đồ ảnh.");
      return;
    }
    
    setIsAIProcessing(true);
    try {
      const base64 = await getBase64FromUrl(dutyInfo.mapImageUrl);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `Phân tích sơ đồ an ninh/bảo vệ này một cách chi tiết. 
      Hãy nhận diện và xác định tọa độ của:
      1. Các Chốt bảo vệ (Checkpoints): Thường là các điểm đánh dấu, trạm gác, hoặc các vị trí có chữ 'Chốt', 'Trạm'.
      2. Các Tổ/Đội công tác (Teams/Units): Các khu vực được phân chia cho các tổ, thường có chữ 'Tổ 1', 'Tổ 2', 'Đội 1', v.v.
      3. Các Tuyến tuần tra (Patrol Routes): Các đường kẻ hoặc hành lang bảo vệ.
      4. Các khu vực quan trọng khác: Cổng, Bãi xe, Sân khấu, v.v.

      Lưu ý quan trọng:
      - Hãy đọc các nhãn chữ trong ảnh để xác định tên chính xác của các chốt và tổ.
      - Nếu thấy các ký hiệu như vòng tròn, hình vuông có đánh số, đó thường là các chốt.
      - Nếu thấy các vùng được bao quanh hoặc tô màu, đó thường là khu vực của các tổ.

      Với mỗi khu vực, hãy cung cấp:
      1. Tên mô tả (tiếng Việt, ví dụ: 'Chốt 1 - Cổng chính', 'Tổ tuần tra số 2').
      2. Loại hình dạng: 'Rectangle' (hình chữ nhật) hoặc 'Polygon' (đa giác).
      3. Tọa độ: 
         - Nếu là 'Rectangle': Cung cấp 2 điểm [y, x] đại diện cho góc dưới bên trái và góc trên bên phải.
         - Nếu là 'Polygon': Cung cấp một mảng các điểm [y, x] theo thứ tự bao quanh vùng.
         Lưu ý: y và x nằm trong khoảng từ 0 đến 1000 (0,0 là góc dưới bên trái, 1000,1000 là góc trên bên phải của ảnh).
      Trả về kết quả dưới dạng một mảng JSON các đối tượng.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64,
              },
            },
            { text: prompt },
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { 
                  type: Type.STRING,
                  description: "Tên mô tả của khu vực"
                },
                type: { 
                  type: Type.STRING,
                  description: "Loại hình dạng: 'Rectangle' hoặc 'Polygon'"
                },
                coords: { 
                  type: Type.ARRAY, 
                  items: { 
                    type: Type.ARRAY, 
                    items: { type: Type.NUMBER } 
                  } 
                }
              },
              required: ["name", "type", "coords"]
            }
          }
        }
      });

      const detectedAreas = JSON.parse(response.text);
      
      if (detectedAreas && detectedAreas.length > 0) {
        const h = dutyInfo.imageHeight || 1000;
        const w = dutyInfo.imageWidth || 1000;
        
        const newZones: Zone[] = detectedAreas.map((area: any, index: number) => {
          // Convert 0-1000 coordinates to actual image coordinates
          const positions = area.coords.map((p: [number, number]) => [
            (p[0] / 1000) * h,
            (p[1] / 1000) * w
          ]);

          return {
            id: `ai-${Date.now()}-${index}`,
            type: area.type,
            positions: positions, // Store all points, the renderer will handle it
            label: area.name,
            assignedUserIds: [],
            color: '#3b82f6',
            fillColor: '#93c5fd',
            textColor: '#1e40af',
            dutyId: dutyInfo.id
          };
        });

        // Save all new zones to Supabase
        const { error } = await supabase.from('map_zones').insert(newZones);
        if (error) throw error;
        
        alert(`Đã nhận diện thành công ${newZones.length} khu vực.`);
      }
    } catch (error) {
      console.error("AI Detection Error:", error);
      alert("Không thể nhận diện vùng bằng AI. Có thể do lỗi kết nối hoặc hình ảnh không rõ ràng.");
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleAISuggestAssignments = async () => {
    if (!isLeader) return;
    if (zones.length === 0) {
      alert("Vui lòng vẽ các chốt trước khi phân công.");
      return;
    }
    if (users.length === 0) {
      alert("Không có cán bộ để phân công.");
      return;
    }

    setIsAIProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `Dựa trên danh sách các chốt bảo vệ: ${zones.map(z => z.label).join(', ')} 
      và danh sách cán bộ: ${users.map(u => u.fullName).join(', ')}.
      Hãy đưa ra gợi ý phân công cán bộ vào các chốt một cách hợp lý nhất. 
      Trả về kết quả dưới dạng JSON mapping tên chốt sang mảng ID cán bộ (nếu có thể tìm thấy ID từ danh sách cán bộ sau: ${JSON.stringify(users.map(u => ({id: u.id, name: u.fullName})))}).
      Nếu không chắc chắn, hãy gán ít nhất 1 cán bộ cho mỗi chốt quan trọng.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const suggestions = JSON.parse(response.text);
      
      // Update each zone in Supabase with suggested assignments
      for (const zone of zones) {
        const suggestedUserIds = suggestions[zone.label] || [];
        if (suggestedUserIds.length > 0) {
          await supabase.from('map_zones').update({ assignedUserIds: suggestedUserIds }).eq('id', zone.id);
        }
      }

      alert("Đã hoàn tất gợi ý phân công cán bộ bằng AI.");
    } catch (error) {
      console.error("AI Assignment Error:", error);
      alert("Không thể thực hiện phân công bằng AI.");
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!isLeader) return;
    if (confirm('Bạn có chắc chắn muốn xóa chốt này?')) {
      const { error } = await supabase.from('map_zones').delete().eq('id', zoneId);
      if (error) {
         console.error("Error deleting zone:", error);
         alert("Lỗi khi xóa vùng.");
      }
      
      setSelectedZone(null);
      setShowAssignModal(false);
    }
  };

  const handleLocateMe = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newPos = new L.LatLng(latitude, longitude);
          setUserLocation(newPos);
          setMapCenter(newPos);
          setMapZoom(16);
          setIsLocating(false);
        },
        () => {
          alert("Không thể xác định vị trí của bạn.");
          setIsLocating(false);
        }
      );
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUploadForAI = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isLeader) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (zones.length === 0) {
      alert("Vui lòng vẽ các chốt trước khi phân công.");
      return;
    }
    if (users.length === 0) {
      alert("Không có cán bộ để phân công.");
      return;
    }

    setIsAIProcessing(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const mimeType = file.type;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const prompt = `Dựa trên danh sách các chốt bảo vệ: ${zones.map(z => z.label).join(', ')} 
        và danh sách cán bộ: ${users.map(u => u.fullName).join(', ')}.
        Hãy phân tích tài liệu đính kèm và đưa ra gợi ý phân công cán bộ vào các chốt một cách hợp lý nhất theo nội dung tài liệu. 
        Trả về kết quả dưới dạng JSON mapping tên chốt sang mảng ID cán bộ (nếu có thể tìm thấy ID từ danh sách cán bộ sau: ${JSON.stringify(users.map(u => ({id: u.id, name: u.fullName})))}).
        Chỉ trả về JSON, không kèm text khác.`;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              },
              { text: prompt }
            ]
          },
          config: {
            responseMimeType: "application/json",
          }
        });

        const suggestions = JSON.parse(response.text);
        
        // Update each zone in Supabase with suggested assignments
        for (const zone of zones) {
          const suggestedUserIds = suggestions[zone.label] || [];
          if (suggestedUserIds.length > 0) {
            await supabase.from('map_zones').update({ assignedUserIds: suggestedUserIds }).eq('id', zone.id);
          }
        }

        alert("Đã hoàn tất gợi ý phân công cán bộ bằng AI từ file.");
        setIsAIProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("AI Assignment Error:", error);
      alert("Không thể thực hiện phân công bằng AI từ file.");
      setIsAIProcessing(false);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Find user's assigned zones
  const myAssignedZones = useMemo(() => {
    return zones.filter(z => z.assignedUserIds.includes(currentUser.id));
  }, [zones, currentUser.id]);

  // Visibility logic: 
  // 1. Sidebar always shows all zones for the current duty so users can see other posts
  // 2. Map only shows user's assigned zones if they are not a leader/admin
  const mapVisibleZones = useMemo(() => {
    if (isLeader) return zones;
    return zones.filter(z => z.assignedUserIds.includes(currentUser.id));
  }, [zones, isLeader, currentUser.id]);

  // Filter zones for sidebar (always show all zones for the duty)
  const filteredZones = zones.filter(z => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (z.label.toLowerCase().includes(query)) return true;
    
    // Check assigned users
    const assignedUsers = users.filter(u => z.assignedUserIds.includes(u.id));
    return assignedUsers.some(u => (u.fullName || '').toLowerCase().includes(query));
  });

  const imageBounds = useMemo(() => {
    if (dutyInfo?.mapType === 'image') {
      return [[0, 0], [dutyInfo.imageHeight || 1000, dutyInfo.imageWidth || 1000]] as L.LatLngBoundsExpression;
    }
    return undefined;
  }, [dutyInfo?.id, dutyInfo?.imageHeight, dutyInfo?.imageWidth, dutyInfo?.mapType]);

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-stone-100">
      {viewMode === 'list' ? (
        <DutyList 
          duties={duties} 
          isLeader={isLeader} 
          onSelect={handleSelectDuty} 
          onCreate={handleCreateDuty}
          onEdit={handleEditDuty}
          onDelete={handleDeleteDuty}
        />
      ) : (
        <>
          <div className="absolute top-4 left-16 z-[1000]">
            <button 
              onClick={handleBackToList} 
              className="bg-white p-2 rounded-full shadow-lg hover:bg-stone-50 text-stone-600 transition-all active:scale-95"
              title="Quay lại danh sách"
            >
              <ArrowLeft size={20} />
            </button>
          </div>
          <style>
            {`
              .map-label-tooltip {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            font-weight: 800;
            font-size: 14px;
            text-shadow: 
              2px 0 #fff, -2px 0 #fff, 0 2px #fff, 0 -2px #fff,
              1px 1px #fff, -1px -1px #fff, 1px -1px #fff, -1px 1px #fff;
            white-space: nowrap;
          }
          .map-label-tooltip::before {
            display: none !important;
          }
        `}
      </style>
      {/* Mobile Header / Toggle */}
      <div className="absolute top-4 left-4 z-[1000] flex gap-2">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="bg-white p-2.5 rounded-full shadow-lg hover:bg-stone-50 transition-all active:scale-95"
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar */}
      <div 
        className={`absolute top-0 left-0 h-full z-[999] bg-white shadow-2xl transition-transform duration-300 ease-in-out w-full md:w-80 flex flex-col ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b bg-stone-50 pt-16 md:pt-4">
           <div className="flex justify-between items-center mb-2">
             <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
               <Shield size={18} />
               Sơ đồ bảo vệ
             </h3>
             <div className="flex gap-2">
               <button 
                 onClick={handleExport}
                 className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded transition-colors"
                 title="Xuất danh sách bảo vệ (CSV)"
               >
                 <Download size={16} />
               </button>
               {isLeader && (
                 <div className="flex gap-2">
                   <button 
                     onClick={() => setIsDeleteMode(!isDeleteMode)}
                     className={`text-xs px-2 py-1 rounded font-medium transition-colors ${isDeleteMode ? 'bg-red-600 text-white animate-pulse' : 'bg-stone-200 hover:bg-stone-300 text-stone-700'}`}
                     title="Bật chế độ xóa nhanh"
                   >
                     {isDeleteMode ? 'Đang xóa...' : 'Xóa'}
                   </button>
                   <button 
                     onClick={() => setShowDutyModal(true)}
                     className="text-xs bg-stone-200 hover:bg-stone-300 px-2 py-1 rounded text-stone-700 font-medium"
                   >
                     Thiết lập
                   </button>
                 </div>
               )}
             </div>
           </div>
           
           {isLeader && (
             <div className="flex flex-col gap-2 mb-3 bg-white p-2 rounded border border-stone-200">
               <div className="flex items-center justify-between">
                 <span className="text-xs font-bold text-stone-600">Màu viền:</span>
                 <input 
                   type="color" 
                   value={defaultColor}
                   onChange={(e) => setDefaultColor(e.target.value)}
                   className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                   title="Chọn màu viền mặc định"
                 />
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-xs font-bold text-stone-600">Màu nền:</span>
                 <input 
                   type="color" 
                   value={defaultFillColor}
                   onChange={(e) => setDefaultFillColor(e.target.value)}
                   className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                   title="Chọn màu nền mặc định"
                 />
               </div>
               <div className="flex items-center justify-between">
                 <span className="text-xs font-bold text-stone-600">Màu chữ:</span>
                 <input 
                   type="color" 
                   value={defaultTextColor}
                   onChange={(e) => setDefaultTextColor(e.target.value)}
                   className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                   title="Chọn màu chữ mặc định"
                 />
               </div>
             </div>
           )}

           {dutyInfo && (
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm mb-2">
              <h4 className="font-bold text-blue-800 mb-1">{dutyInfo.title}</h4>
              <div className="text-blue-600 text-xs space-y-1">
                <p>Bắt đầu: {new Date(dutyInfo.startTime).toLocaleString('vi-VN')}</p>
                <p>Kết thúc: {new Date(dutyInfo.endTime).toLocaleString('vi-VN')}</p>
              </div>
            </div>
          )}

            {isLeader && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button 
                  onClick={handleAIDetectZones}
                  disabled={isAIProcessing || dutyInfo?.mapType !== 'image'}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm border ${
                    isAIProcessing 
                      ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' 
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 active:scale-95'
                  } ${dutyInfo?.mapType !== 'image' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Tự động nhận diện các khu vực trên sơ đồ bằng AI (Chỉ dành cho sơ đồ ảnh)"
                >
                  <Sparkles size={14} className={isAIProcessing ? 'animate-spin' : ''} />
                  AI Nhận diện
                </button>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={handleAISuggestAssignments}
                    disabled={isAIProcessing || zones.length === 0}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm border ${
                      isAIProcessing || zones.length === 0
                        ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 active:scale-95'
                    }`}
                    title="Tự động phân công cán bộ vào các chốt bằng AI"
                  >
                    <Brain size={14} className={isAIProcessing ? 'animate-pulse' : ''} />
                    AI Phân công
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*,.pdf" 
                    onChange={handleFileUploadForAI} 
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAIProcessing || zones.length === 0}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm border ${
                      isAIProcessing || zones.length === 0
                        ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed' 
                        : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 active:scale-95'
                    }`}
                    title="Tải file lên để AI phân tích và phân công"
                  >
                    <Brain size={14} className={isAIProcessing ? 'animate-pulse' : ''} />
                    AI Phân công (File)
                  </button>
                </div>
              </div>
            )}

            <input 
              type="text" 
              placeholder="Tìm kiếm chốt, cán bộ..." 
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* My Assignment Section */}
          {myAssignedZones.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-bold text-stone-500 mb-2">Nhiệm vụ của tôi</h4>
              {myAssignedZones.map(zone => (
                <div 
                  key={zone.id}
                  className="p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                  onClick={() => {
                    // Calculate center of zone to fly to
                    // Simplified: just set selected
                    setSelectedZone(zone);
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-blue-600" />
                    <span className="font-bold text-sm text-blue-800">{zone.label}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h4 className="text-xs font-bold text-stone-500 mb-2">Danh sách chốt ({filteredZones.length})</h4>
          {filteredZones.map(zone => {
             const assigned = users.filter(u => zone.assignedUserIds.includes(u.id));
             const isMyZone = zone.assignedUserIds.includes(currentUser.id);
             
             return (
               <div 
                  key={zone.id} 
                  className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                    isMyZone ? 'bg-blue-50 border-blue-200' : 'bg-white border-stone-200 hover:border-red-300'
                  }`}
                  onClick={() => {
                    if (isDeleteMode) {
                       handleDeleteZone(zone.id);
                       return;
                    }
                    setSelectedZone(zone);
                    setShowAssignModal(true);
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
               >
                 <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-sm" style={{ color: zone.color }}>{zone.label}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      assigned.length > 0 ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {assigned.length} CB
                    </span>
                 </div>
                 <div className="flex flex-wrap gap-1 pl-1 mt-1">
                    {assigned.length === 0 && <span className="text-xs text-stone-400 italic">Chưa phân công</span>}
                    {assigned.map(u => (
                      <span key={u.id} className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200">
                        {u.fullName}
                      </span>
                    ))}
                 </div>
               </div>
             );
          })}
          {filteredZones.length === 0 && <p className="text-center text-stone-400 text-sm py-8">Không tìm thấy kết quả</p>}
        </div>
      </div>

      {/* Map Controls - Moved inside MapContainer */}
      
      {/* Rotation Warning */}
      {rotation !== 0 && isLeader && !isMobile && (
        <div className="absolute top-4 right-16 z-[1000] bg-yellow-100 text-yellow-800 px-3 py-1 rounded-lg text-xs font-bold shadow-sm border border-yellow-300 animate-fade-in">
          Xoay về 0° để vẽ
        </div>
      )}

      {/* Map Container Wrapper */}
      <div 
        ref={containerRef}
        className="w-full h-full overflow-hidden"
      >
        <div 
          className="w-full h-full"
        >
          <MapContainer 
            key={`${dutyInfo?.id || 'map'}-${dutyInfo?.mapType || 'real'}`}
            center={dutyInfo?.mapType === 'image' ? [(dutyInfo.imageHeight || 1000) / 2, (dutyInfo.imageWidth || 1000) / 2] : defaultCenter} 
            zoom={dutyInfo?.mapType === 'image' ? -1 : mapZoom} 
            crs={dutyInfo?.mapType === 'image' ? L.CRS.Simple : L.CRS.EPSG3857}
            minZoom={dutyInfo?.mapType === 'image' ? -10 : undefined}
            maxZoom={dutyInfo?.mapType === 'image' ? 10 : undefined}
            style={{ height: '100%', width: '100%', zIndex: 0 }}
            zoomControl={false}
            preferCanvas={true}
            zoomSnap={0.1}
            zoomDelta={0.5}
            wheelPxPerZoomLevel={60}
            tap={false}
            bounceAtZoomLimits={false}
            maxBoundsViscosity={1.0}
            {...({ rotate: true, touchRotate: !isMobile } as any)}
          >
            <MapUpdater 
              center={dutyInfo?.mapType === 'image' ? [(dutyInfo.imageHeight || 1000) / 2, (dutyInfo.imageWidth || 1000) / 2] : mapCenter} 
              zoom={dutyInfo?.mapType === 'image' ? -1 : mapZoom} 
              setRotation={setRotation} 
              bounds={imageBounds}
            />
            <MapEvents onZoomChange={setCurrentZoom} />
            <GridLayer 
              show={showGrid} 
              isImageMap={dutyInfo?.mapType === 'image'} 
              imageHeight={dutyInfo?.imageHeight} 
              imageWidth={dutyInfo?.imageWidth} 
            />
            
            <MapControls 
              rotation={rotation} 
              isLocating={isLocating} 
              onLocate={handleLocateMe} 
              isImageMap={dutyInfo?.mapType === 'image'}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid(!showGrid)}
              imageBounds={imageBounds}
              containerRef={containerRef}
            />
            
            {dutyInfo?.mapType === 'image' && dutyInfo.mapImageUrl && (
               <ImageOverlay 
                  key={dutyInfo.mapImageUrl}
                  url={(() => {
                    let url = dutyInfo.mapImageUrl;
                    if (url.includes('drive.google.com/file/d/')) {
                      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                      if (match && match[1]) {
                        url = `https://drive.google.com/uc?id=${match[1]}`;
                      }
                    } else if (url.includes('drive.google.com/open?id=')) {
                      const match = url.match(/id=([a-zA-Z0-9_-]+)/);
                      if (match && match[1]) {
                        url = `https://drive.google.com/uc?id=${match[1]}`;
                      }
                    }
                    return url.replace(/^http:\/\//i, 'https://');
                  })()}
                  bounds={[[0, 0], [dutyInfo.imageHeight || 1000, dutyInfo.imageWidth || 1000]]}
               />
            )}

            {dutyInfo?.mapType !== 'image' && (
              <LayersControl position="bottomright">
              <LayersControl.BaseLayer checked name="Bản đồ đường phố">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Bản đồ vệ tinh (Google)">
                <TileLayer
                  url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                  attribution='&copy; Google Maps'
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Bản đồ vệ tinh (Esri)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>
            </LayersControl>
            )}
            
            {/* Draw Control for Leaders */}
            {isLeader && rotation === 0 && (
               <EditControl 
                  drawEnabled={true} 
                  onCreated={handleCreated}
                  onEdited={handleEdited}
                  defaultColor={defaultColor}
                  defaultFillColor={defaultFillColor}
                  featureGroup={fgInstance}
               />
            )}

            {/* User Location Marker */}
            {userLocation && (
              <>
                <Marker position={userLocation} icon={userLocationIcon}>
                  <Popup>
                    <div className="text-center">
                      <h3 className="font-bold text-sm">Vị trí của bạn</h3>
                      <p className="text-xs text-stone-500">Đang cập nhật...</p>
                    </div>
                  </Popup>
                </Marker>
                {/* Circle showing accuracy/radius could be added here */}
                <Circle center={userLocation} radius={20} pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1, weight: 1 }} />
              </>
            )}

            {/* Connection Lines to Assigned Zones */}
            {userLocation && myAssignedZones.map(zone => {
              // Calculate centroid for connection line
              let center: L.LatLngExpression | null = null;
              if (zone.type === 'Polygon' || zone.type === 'Rectangle') {
                 // Simple centroid approximation
                 // In real app, use a library or proper calculation
                 // For now, take the first point
                 if (Array.isArray(zone.positions) && zone.positions.length > 0) {
                    const p = zone.positions[0];
                    if (Array.isArray(p)) center = p[0] as any; // Nested array
                    else center = p as any;
                 }
              } else if (zone.type === 'Label' || zone.type === 'Polyline') {
                 // Use position directly if possible, or first point
                 if (Array.isArray(zone.positions)) center = zone.positions[0] as any;
                 else center = zone.positions as any;
              }

              if (center) {
                return (
                  <Polyline 
                    key={`conn-${zone.id}`}
                    positions={[userLocation, center]}
                    pathOptions={{ color: 'blue', dashArray: '5, 10', weight: 2, opacity: 0.6 }}
                  >
                    <Tooltip sticky direction="center" className="text-xs font-bold text-blue-600">
                      Đến: {zone.label}
                    </Tooltip>
                  </Polyline>
                );
              }
              return null;
            })}

            {/* Render Zones */}
            <FeatureGroup ref={(ref) => { if (ref) setFgInstance(ref); }}>
            {mapVisibleZones.map(zone => {
               const assigned = users.filter(u => zone.assignedUserIds.includes(u.id));
               const isMyZone = zone.assignedUserIds.includes(currentUser.id);
               
               const CommonPopup = () => (
                  <Popup>
                     <div className="p-2 min-w-[200px]">
                        <h3 className="font-bold text-lg mb-2" style={{ color: zone.color }}>{zone.label}</h3>
                        <div className="mb-3">
                           <h4 className="text-xs font-bold text-stone-500 mb-1">Cán bộ phụ trách:</h4>
                           <div className="flex flex-wrap gap-1">
                              {assigned.map(u => (
                                 <div key={u.id} className={`flex items-center gap-1 px-2 py-1 rounded-full ${u.id === currentUser.id ? 'bg-blue-100 text-blue-800' : 'bg-stone-100'}`}>
                                    <span className="text-xs font-medium">{u.fullName} {u.id === currentUser.id && '(Tôi)'}</span>
                                 </div>
                              ))}
                              {assigned.length === 0 && <span className="text-xs text-stone-400 italic">Chưa có</span>}
                           </div>
                        </div>
                        {isLeader && (
                           <div className="flex gap-2 mt-2 pt-2 border-t">
                              <button 
                                 onClick={() => handleAssign(zone)}
                                 className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700"
                              >
                                 Cập nhật
                              </button>
                              <button 
                                 onClick={() => handleDeleteZone(zone.id)}
                                 className="px-3 bg-red-100 text-red-600 text-xs py-1.5 rounded hover:bg-red-200"
                              >
                                 Xóa
                              </button>
                           </div>
                        )}
                     </div>
                  </Popup>
               );

               if (zone.type === 'Polyline') {
                  const { center, angle } = getPolylineData(zone.positions);
                  
                  return (
                     <React.Fragment key={zone.id}>
                       <Polyline 
                          // @ts-ignore
                          id={zone.id}
                          positions={zone.positions}
                          pathOptions={{ color: zone.color, weight: isMobile ? 10 : 6, opacity: isMyZone ? 1 : 0.8 }}
                          eventHandlers={{ click: (e) => {
                             if (isDeleteMode && isLeader) {
                                L.DomEvent.stopPropagation(e);
                                handleDeleteZone(zone.id);
                             } else if (!isLeader) {
                                setIsSidebarOpen(true);
                             }
                          }}}
                       >
                          <CommonPopup />
                       </Polyline>
                       {center && currentZoom >= 15 && (
                         <Marker
                           position={center}
                           icon={new L.DivIcon({
                             className: 'bg-transparent',
                             html: getLabelHtml(zone.label, assigned, zone.textColor || '#000000', angle, false, isMyZone, isMobile),
                             iconSize: [100, 40],
                             iconAnchor: [50, 20]
                           })}
                         />
                       )}
                     </React.Fragment>
                  );
               }

               if (zone.type === 'Label') {
                  return (
                     <Marker 
                        key={zone.id}
                        // @ts-ignore
                        id={zone.id}
                        position={zone.positions}
                        opacity={0} // Invisible marker, only label
                        eventHandlers={{ click: (e) => {
                             if (isDeleteMode && isLeader) {
                                L.DomEvent.stopPropagation(e);
                                handleDeleteZone(zone.id);
                             } else if (!isLeader) {
                                setIsSidebarOpen(true);
                             }
                          }}}
                     >
                        {currentZoom >= 15 && (
                           <Tooltip permanent direction="center" className="bg-transparent border-0 shadow-none font-bold text-lg text-shadow-md">
                              <div dangerouslySetInnerHTML={{ __html: getLabelHtml(zone.label, assigned, zone.textColor || zone.color, 0, true, isMyZone, isMobile) }} />
                           </Tooltip>
                        )}
                        <CommonPopup />
                     </Marker>
                  );
               }

               // Polygon / Rectangle
               // Calculate center for label
               let polygonCenter: L.LatLngExpression | null = null;
               if (zone.positions && zone.positions.length > 0) {
                  // Simple centroid
                  const points = Array.isArray(zone.positions[0]) ? zone.positions[0] : zone.positions;
                  if (points.length > 0) {
                     // Handle both [lat, lng] and {lat, lng} formats
                     let latSum = 0;
                     let lngSum = 0;
                     let count = 0;
                     
                     points.forEach((p: any) => {
                        if (Array.isArray(p)) {
                           latSum += p[0];
                           lngSum += p[1];
                        } else {
                           latSum += p.lat;
                           lngSum += p.lng;
                        }
                        count++;
                     });
                     
                     if (count > 0) {
                        polygonCenter = [latSum / count, lngSum / count] as L.LatLngExpression;
                     }
                  }
               }

               if (zone.type === 'Rectangle') {
                  return (
                    <React.Fragment key={zone.id}>
                      <Rectangle 
                         // @ts-ignore
                         id={zone.id}
                         bounds={zone.positions as any}
                         pathOptions={{ 
                           color: zone.color, 
                           fillColor: zone.fillColor || zone.color, 
                           fillOpacity: isMyZone ? 0.4 : 0.2,
                           weight: isMobile ? (isMyZone ? 8 : 4) : (isMyZone ? 4 : 2)
                         }}
                         eventHandlers={{ click: (e) => {
                                 if (isDeleteMode && isLeader) {
                                    L.DomEvent.stopPropagation(e);
                                    handleDeleteZone(zone.id);
                                 } else if (!isLeader) {
                                    setIsSidebarOpen(true);
                                 }
                         }}}
                      >
                         <CommonPopup />
                      </Rectangle>
                      {polygonCenter && currentZoom >= 15 && (
                        <Marker
                          position={polygonCenter}
                          icon={new L.DivIcon({
                            className: 'bg-transparent',
                            html: getLabelHtml(zone.label, assigned, zone.textColor || '#000000', 0, false, isMyZone, isMobile),
                            iconSize: [100, 40],
                            iconAnchor: [50, 20]
                          })}
                        />
                      )}
                    </React.Fragment>
                  );
               }

               return (
                <React.Fragment key={zone.id}>
                  <Polygon 
                     // @ts-ignore
                     id={zone.id}
                     positions={zone.positions as any}
                     pathOptions={{ 
                       color: zone.color, 
                       fillColor: zone.fillColor || zone.color, 
                       fillOpacity: isMyZone ? 0.4 : 0.2,
                       weight: isMobile ? (isMyZone ? 8 : 4) : (isMyZone ? 4 : 2)
                     }}
                     eventHandlers={{ click: (e) => {
                             if (isDeleteMode && isLeader) {
                                L.DomEvent.stopPropagation(e);
                                handleDeleteZone(zone.id);
                             } else if (!isLeader) {
                                setIsSidebarOpen(true);
                             }
                          }}}
                  >
                     <CommonPopup />
                  </Polygon>
                  {polygonCenter && currentZoom >= 15 && (
                     <Marker
                        position={polygonCenter}
                        icon={new L.DivIcon({
                           className: 'bg-transparent',
                           html: getLabelHtml(zone.label, assigned, zone.textColor || '#ffffff', 0, true, isMyZone, isMobile),
                           iconSize: [0, 0] // Allow CSS to handle size
                        })}
                     />
                  )}
                </React.Fragment>
               );
            })}
            </FeatureGroup>
          </MapContainer>
        </div>
      </div>

        </>
      )}

      {/* Duty Info Modal */}
      {showDutyModal && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-stone-50">
              <h3 className="font-bold text-lg">Thiết lập thông tin bảo vệ</h3>
              <button onClick={() => setShowDutyModal(false)} aria-label="Đóng" className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Nội dung bảo vệ</label>
                <input 
                  type="text" 
                  id="duty-title"
                  className="w-full px-3 py-2 border rounded-lg"
                  defaultValue={dutyInfo?.title || ''}
                  placeholder="VD: Bảo vệ lễ hội..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Loại bản đồ</label>
                <div className="flex gap-4 mb-2">
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="mapType" 
                        value="real" 
                        checked={modalMapType === 'real'}
                        onChange={() => setModalMapType('real')}
                      />
                      <span>Bản đồ thực (GPS)</span>
                   </label>
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="mapType" 
                        value="image" 
                        checked={modalMapType === 'image'}
                        onChange={() => setModalMapType('image')}
                      />
                      <span>Ảnh sơ đồ</span>
                   </label>
                </div>
              </div>
              
              {modalMapType === 'image' && (
                 <div className="space-y-4">
                    <div>
                       <label className="block text-sm font-bold text-stone-700 mb-1">Đường dẫn ảnh (URL)</label>
                       <div className="flex gap-2">

                          <input 
                            type="text" 
                            id="map-image-url"
                            className="flex-1 px-3 py-2 border rounded-lg"
                            defaultValue={dutyInfo?.mapImageUrl || ''}
                            placeholder="https://example.com/map.jpg"
                            onBlur={(e) => {
                               // Try to auto-detect dimensions when URL is entered
                               const url = e.target.value;
                               if (url) {
                                  const img = new Image();
                                  img.onload = () => {
                                     const wInput = document.getElementById('map-image-width') as HTMLInputElement;
                                     const hInput = document.getElementById('map-image-height') as HTMLInputElement;
                                     if (wInput) wInput.value = img.width.toString();
                                     if (hInput) hInput.value = img.height.toString();
                                  };
                                  img.src = url;
                               }
                            }}
                          />
                       </div>
                       <p className="text-[10px] text-stone-500 mt-1 italic">Mẹo: Nhập URL rồi nhấn ra ngoài để tự động lấy kích thước.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-sm font-bold text-stone-700 mb-1">Chiều rộng (px)</label>
                          <input 
                            type="number" 
                            id="map-image-width"
                            className="w-full px-3 py-2 border rounded-lg"
                            defaultValue={dutyInfo?.imageWidth || 1000}
                          />
                       </div>
                       <div>
                          <label className="block text-sm font-bold text-stone-700 mb-1">Chiều cao (px)</label>
                          <input 
                            type="number" 
                            id="map-image-height"
                            className="w-full px-3 py-2 border rounded-lg"
                            defaultValue={dutyInfo?.imageHeight || 1000}
                          />
                       </div>
                    </div>
                 </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Bắt đầu</label>
                  <input 
                    type="datetime-local" 
                    id="duty-start"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    defaultValue={dutyInfo?.startTime || ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Kết thúc</label>
                  <input 
                    type="datetime-local" 
                    id="duty-end"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    defaultValue={dutyInfo?.endTime || ''}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <button 
                  onClick={() => {
                    handleSaveDutyInfo(null);
                    setShowDutyModal(false);
                  }} 
                  className="px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg font-medium mr-auto"
                >
                  Xóa thiết lập
                </button>
                <button onClick={() => setShowDutyModal(false)} className="px-4 py-2 text-stone-500 hover:bg-stone-100 rounded-lg font-medium">Hủy</button>
                <button 
                  onClick={() => {
                    const title = (document.getElementById('duty-title') as HTMLInputElement).value;
                    const startTime = (document.getElementById('duty-start') as HTMLInputElement).value;
                    const endTime = (document.getElementById('duty-end') as HTMLInputElement).value;
                    const mapImageUrl = modalMapType === 'image' ? (document.getElementById('map-image-url') as HTMLInputElement)?.value : undefined;
                    const imageWidth = modalMapType === 'image' ? parseInt((document.getElementById('map-image-width') as HTMLInputElement)?.value || '1000') : undefined;
                    const imageHeight = modalMapType === 'image' ? parseInt((document.getElementById('map-image-height') as HTMLInputElement)?.value || '1000') : undefined;
                    
                    if (!title || !startTime || !endTime) {
                      alert("Vui lòng nhập đầy đủ thông tin!");
                      return;
                    }
                    
                    if (modalMapType === 'image' && !mapImageUrl) {
                       alert("Vui lòng nhập URL ảnh sơ đồ!");
                       return;
                    }
                    
                    handleSaveDutyInfo({ 
                      title, 
                      startTime, 
                      endTime, 
                      mapType: modalMapType, 
                      mapImageUrl,
                      imageWidth,
                      imageHeight
                    });
                    setShowDutyModal(false);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg"
                >
                  Lưu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Processing Overlay */}
      {isAIProcessing && (
        <div className="fixed inset-0 z-[3000] bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-fade-in-up">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600 animate-pulse" size={24} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg text-stone-800">AI đang xử lý...</h3>
              <p className="text-sm text-stone-500">Vui lòng đợi trong giây lát</p>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && selectedZone && (
         <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
               <div className="px-6 py-4 border-b flex justify-between items-center bg-stone-50">
                  <h3 className="font-bold text-lg">{isLeader ? 'Cập nhật thông tin' : 'Thông tin chốt bảo vệ'}</h3>
                  <button onClick={() => setShowAssignModal(false)} aria-label="Đóng" className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
               </div>
               <div className="p-6 space-y-4">
                  <div>
                     <label className="block text-sm font-bold text-stone-700 mb-1">Tên chốt / Vị trí</label>
                     <input 
                        type="text" 
                        className="w-full px-3 py-2 border rounded-lg disabled:bg-stone-50 disabled:text-stone-500"
                        defaultValue={selectedZone.label}
                        id="zone-label"
                        disabled={!isLeader}
                     />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                       <label className="block text-xs font-bold text-stone-600 mb-1">Màu viền</label>
                       <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={selectedZone.color}
                            onChange={(e) => setSelectedZone({...selectedZone, color: e.target.value})}
                            className="w-full h-8 p-0 border border-stone-300 rounded cursor-pointer disabled:cursor-not-allowed"
                            disabled={!isLeader}
                          />
                       </div>
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-stone-600 mb-1">Màu nền</label>
                       <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={selectedZone.fillColor || selectedZone.color}
                            onChange={(e) => setSelectedZone({...selectedZone, fillColor: e.target.value})}
                            className="w-full h-8 p-0 border border-stone-300 rounded cursor-pointer disabled:cursor-not-allowed"
                            disabled={!isLeader}
                          />
                       </div>
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-stone-600 mb-1">Màu chữ</label>
                       <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={selectedZone.textColor || '#000000'}
                            onChange={(e) => setSelectedZone({...selectedZone, textColor: e.target.value})}
                            className="w-full h-8 p-0 border border-stone-300 rounded cursor-pointer disabled:cursor-not-allowed"
                            disabled={!isLeader}
                          />
                       </div>
                    </div>
                  </div>

                  <div>
                     <label className="block text-sm font-bold text-stone-700 mb-1">Cán bộ tham gia</label>
                     {isLeader && (
                       <input 
                         type="text" 
                         placeholder="Tìm kiếm cán bộ..." 
                         className="w-full px-3 py-1.5 border rounded-lg text-sm mb-2"
                         value={userSearchQuery}
                         onChange={e => setUserSearchQuery(e.target.value)}
                       />
                     )}
                     <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                        {users
                          .filter(u => 
                            !isLeader || (
                              (u.fullName || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                              (u.email || '').toLowerCase().includes(userSearchQuery.toLowerCase())
                            )
                          )
                          .filter(user => isLeader || selectedZone.assignedUserIds.includes(user.id))
                          .map(user => (
                           <label key={user.id} className={`flex items-center gap-3 p-2 rounded ${isLeader ? 'hover:bg-stone-50 cursor-pointer' : ''}`}>
                              {isLeader && (
                                <input 
                                   type="checkbox" 
                                   defaultChecked={selectedZone.assignedUserIds.includes(user.id)}
                                   className="w-4 h-4 text-blue-600 rounded"
                                   value={user.id}
                                   name="zone-users"
                                />
                              )}
                              <Avatar name={user.fullName} size={24} />
                              <span className="text-sm font-medium">{user.fullName}</span>
                           </label>
                        ))}
                        {!isLeader && selectedZone.assignedUserIds.length === 0 && (
                          <p className="text-xs text-stone-400 italic p-2">Chưa có cán bộ nào được phân công</p>
                        )}
                     </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 border-t">
                     {isLeader ? (
                       <>
                         <button 
                            onClick={() => {
                               if (window.confirm('Bạn có chắc chắn muốn xóa chốt này? Thao tác này không thể hoàn tác.')) {
                                  handleDeleteZone(selectedZone.id);
                                  setShowAssignModal(false);
                               }
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                            title="Xóa chốt này khỏi sơ đồ"
                         >
                            <Trash2 size={16} />
                            <span>Xóa chốt</span>
                         </button>
                         <div className="flex gap-2">
                            <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-stone-500 hover:bg-stone-100 rounded-lg font-medium">Hủy</button>
                            <button 
                               onClick={() => {
                                  const labelInput = document.getElementById('zone-label') as HTMLInputElement;
                                  const label = labelInput ? labelInput.value : selectedZone.label;
                                  const checkboxes = document.getElementsByName('zone-users') as NodeListOf<HTMLInputElement>;
                                  const userIds = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
                                  handleSaveAssignment(
                                    userIds, 
                                    label, 
                                    selectedZone.color, 
                                    selectedZone.fillColor || selectedZone.color, 
                                    selectedZone.textColor || '#000000'
                                  );
                               }}
                               className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2"
                            >
                               Lưu thay đổi
                            </button>
                         </div>
                       </>
                     ) : (
                       <button onClick={() => setShowAssignModal(false)} className="w-full px-4 py-2 bg-stone-100 text-stone-600 rounded-lg font-bold hover:bg-stone-200 transition-colors">Đóng</button>
                     )}
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
