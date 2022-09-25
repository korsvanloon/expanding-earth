Get info of file

```
gdalinfo big-data-map.tif
```

Normalize to byte data (e.g from Float 32)

```
gdal_translate -ot byte big-data-map.tif byte-data-map.tif
```

Convert to an equirectangular file of size 512 \* 1024

```bash
gdalwarp -r average -ts 0 1024 -t_srs EPSG:4979 -te -180 -90 180 90 -overwrite byte-data-map.tif equirectangular-data-map.tif
```

Convert to png

```bash
gdaltransform equirectangular-data-map.tif data-map.png
```
