
array=( 192.168.186.5:3001 192.168.186.35:3001 192.168.186.2:3001 192.168.186.3:3001 192.168.186.7:3001 192.168.180.81:3001 192.168.180.80:3001 192.168.180.82:3001)
for i in "${array[@]}"
do
	echo $i
	curl 'http://'$i'/update'
done
