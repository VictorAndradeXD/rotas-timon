// Inicializa o mapa
const map = L.map('map').setView([-23.5505, -46.6333], 12);

// Adiciona camada do OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Variáveis globais
let addresses = [];
let routeLayer = null;
let markers = [];

// Elementos da interface
const addressInput = document.getElementById('addressInput');
const addAddressBtn = document.getElementById('addAddress');
const addressList = document.getElementById('addressList');
const routeInfo = document.getElementById('routeInfo');

// Evento para adicionar endereço
addAddressBtn.addEventListener('click', () => {
    const address = addressInput.value.trim();
    if (address) {
        addAddress(address);
        addressInput.value = '';
    }
});

// Também adiciona com Enter
addressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addAddressBtn.click();
    }
});

// Função para adicionar endereço
async function addAddress(address) {
    try {
        // Geocodificação usando Nominatim
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const data = await response.json();
        
        if (data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            const displayName = data[0].display_name.split(',')[0];
            
            addresses.push({
                address: displayName,
                fullAddress: address,
                latlng: [lat, lon]
            });
            
            updateAddressList();
            updateRoute();
        } else {
            alert('Endereço não encontrado. Tente ser mais específico.');
        }
    } catch (error) {
        console.error('Erro ao geocodificar:', error);
        alert('Erro ao buscar endereço. Tente novamente.');
    }
}

// Atualiza a lista de endereços na interface
function updateAddressList() {
    addressList.innerHTML = '';
    
    addresses.forEach((addr, index) => {
        const item = document.createElement('div');
        item.className = 'address-item';
        item.draggable = true;
        item.dataset.index = index;
        
        item.innerHTML = `
            <span>${index + 1}. ${addr.address}</span>
            <button class="remove-btn" data-index="${index}">×</button>
        `;
        
        addressList.appendChild(item);
        
        // Evento para remover endereço
        item.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeAddress(index);
        });
        
        // Eventos para drag and drop
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
    });
    
    // Eventos para reordenar
    addressList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingItem = document.querySelector('.dragging');
        const afterElement = getDragAfterElement(addressList, e.clientY);
        
        if (afterElement) {
            addressList.insertBefore(draggingItem, afterElement);
        } else {
            addressList.appendChild(draggingItem);
        }
    });
    
    addressList.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const draggingItem = document.querySelector('.dragging');
        const afterElement = getDragAfterElement(addressList, e.clientY);
        
        let toIndex;
        if (afterElement) {
            toIndex = parseInt(afterElement.dataset.index);
            if (fromIndex < toIndex) toIndex--;
        } else {
            toIndex = addresses.length - 1;
        }
        
        if (fromIndex !== toIndex) {
            reorderAddresses(fromIndex, toIndex);
        }
    });
}

// Função auxiliar para drag and drop
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.address-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Remove um endereço
function removeAddress(index) {
    addresses.splice(index, 1);
    updateAddressList();
    updateRoute();
}

// Reordena os endereços
function reorderAddresses(fromIndex, toIndex) {
    const [removed] = addresses.splice(fromIndex, 1);
    addresses.splice(toIndex, 0, removed);
    updateAddressList();
    updateRoute();
}

async function updateRoute() {
    // Remove a rota anterior
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
    
    // Remove marcadores antigos
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Adiciona marcadores para cada endereço
    addresses.forEach((addr, index) => {
        const marker = L.marker(addr.latlng, {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<div class="marker-number">${index + 1}</div>
                       <div class="marker-pin"></div>`,
                iconSize: [30, 42],
                iconAnchor: [15, 42],
                popupAnchor: [0, -36]
            })
        }).addTo(map);
        
        marker.bindPopup(`
            <b>Ponto ${index + 1}</b><br>
            ${addr.fullAddress}<br>
            <small>Lat: ${addr.latlng[0].toFixed(4)}, Lng: ${addr.latlng[1].toFixed(4)}</small>
        `);
        
        markers.push(marker);
        
        L.circle(addr.latlng, {
            color: '#3388ff',
            fillColor: '#3388ff',
            fillOpacity: 0.2,
            radius: 50
        }).addTo(map);
    });
    
    // Se houver menos de 2 endereços, não calcula rota
    if (addresses.length < 2) {
        routeInfo.innerHTML = 'Adicione pelo menos 2 endereços para calcular uma rota.';
        return;
    }
    
    try {
        // Prepara coordenadas no formato longitude,latitude
        const coordinates = addresses.map(a => `${a.latlng[1]},${a.latlng[0]}`).join(';');
        
        // URL corrigida para a API OSRM
        const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distance = (route.distance / 1000).toFixed(1);
            const duration = Math.floor(route.duration / 60);
            
            routeInfo.innerHTML = `
                <h3>Informações da Rota</h3>
                <p><strong>Distância total:</strong> ${distance} km</p>
                <p><strong>Duração estimada:</strong> ${duration} minutos</p>
                <p><strong>Número de paradas:</strong> ${addresses.length}</p>
            `;
            
            // Desenha a rota no mapa
            routeLayer = L.geoJSON(route.geometry, {
                style: {
                    color: '#FF5722',
                    weight: 5,
                    opacity: 0.8,
                    dashArray: '5, 5'
                }
            }).addTo(map);
            
            // Ajusta o zoom para mostrar toda a rota
            map.fitBounds(routeLayer.getBounds());
        } else {
            routeInfo.innerHTML = `Não foi possível calcular a rota. Código: ${data.code || 'Erro desconhecido'}`;
            console.error('Resposta da API OSRM:', data);
        }
    } catch (error) {
        console.error('Erro ao calcular rota:', error);
        routeInfo.innerHTML = `Erro ao calcular rota: ${error.message}`;
    }
}