export const Units={
  feetInches(ft){ft=Math.max(0,ft);let f=Math.floor(ft+1e-9),i=Math.round((ft-f)*12);if(i>=12){f++;i=0}return `${f}'${i}"`},
  meters(ft){return `${(ft*.3048).toFixed(2)}m`},
  length(ft){return `${this.feetInches(ft)} / ${this.meters(ft)}`},
  area(sqft){return `${sqft.toFixed(0)} sqft / ${(sqft*.092903).toFixed(1)} sqm`},
  parse(str){if(!str)return null;str=String(str).trim();let m=str.match(/^(\d+(?:\.\d+)?)\s*m$/i);if(m)return +m[1]/.3048;m=str.match(/^(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)?\s*"?$/);if(m)return +m[1]+(m[2]?+m[2]:0)/12;const n=parseFloat(str);return Number.isNaN(n)?null:n}
};
